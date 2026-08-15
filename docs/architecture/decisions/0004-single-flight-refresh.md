# 4. Single-flight token refresh, client-side

## Status

Accepted (Task 3 identified the requirement; Task 9.5 implemented it once, centrally, in `@kurtar/api-client`).

## Context

The backend detects refresh-token **reuse**: the moment an already-rotated refresh token is presented again, it revokes the entire token family (`token.service.ts`'s `refresh()` — an atomic `UPDATE ... WHERE rotatedAt IS NULL` claim; anything that loses that race is treated as a stolen/replayed token, indistinguishable from a real attack). This is the correct security posture for a refresh-token family.

It has one sharp edge for a client: any screen that fires several authenticated requests in parallel (a dashboard loading three widgets at once, say) and gets back several `401`s at the same moment would, with a naive "refresh on every 401" client, fire **N concurrent** `/auth/refresh` calls carrying the **same still-valid** refresh token. Only the first lands at the database; every other one looks — from the backend's point of view — exactly like reuse. The result: the user is logged out of a session they never actually left, purely because their own client raced itself.

## Decision

Refresh is single-flight, implemented **once**, centrally, in `packages/api-client/src/engine.ts` — not left to each of the four frontend surfaces to reimplement (and potentially get subtly wrong four different ways). A module-instance-scoped closure variable, `inFlightRefresh`, memoizes the in-flight refresh `Promise`: every caller that hits a `401` calls `refreshOnce()`, which returns the *same* promise to every concurrent caller for the lifetime of that one outstanding attempt. Exactly one `/auth/refresh` request is ever in flight at a time per client instance; every original request that triggered a refresh then retries once that shared promise resolves.

`docs/frontend-contract.md` makes this a hard rule for every surface: never call `client.auth.refresh()` directly to "handle" a 401 yourselves — the engine already does it, and a second, app-level retry-on-401 path would reintroduce exactly the race this exists to prevent. The one sanctioned exception is a **proactive** refresh (e.g. on cold app start, restoring a session from a stored refresh token) — a single deliberate call outside the 401-triggered path, not a second concurrent-retry mechanism.

## Consequences

- **One implementation, four consumers.** merchant-web, admin-web, landing, and the consumer app all get this for free by using `@kurtar/api-client` — the alternative (each app owning its own 401-handling) was flagged and explicitly rejected during the Wave 3 parallel-build (see the ledger's Task 9.5 entry).
- **The memo is scoped per `createClient()` call, not global** — a test suite instantiating several clients in the same process never shares refresh state across them.
- **A screen that fires a burst of parallel requests right after a token expires now costs at most one refresh round trip**, not N — a real, measurable behavior difference under the exact "several widgets load at once" scenario that originally exposed the bug.
- **Any future client capability (a second SDK, a server-to-server caller) that talks to the same auth endpoints must either go through `@kurtar/api-client` or reimplement this exact single-flight discipline** — the backend's reuse-detection design assumes it.
