# Frontend contract (Task 9.5)

This is the shared surface Tasks 10-13 build on top of. Read this before touching anything — it tells you what already exists, what you're allowed to touch, and the two things you must get right on day one (transport + single-flight refresh) or every session silently logs itself out.

## 1. Workspace layout (already done — do not re-add)

Root `package.json` workspaces: `["backend", "packages/*", "apps/*", "landing"]`.

```
backend/                 NestJS API (Tasks 1-9, complete)
packages/
  api-client/             @kurtar/api-client — the typed client (§3)
  ui-tokens/              @kurtar/ui-tokens — design tokens (§5)
apps/
  merchant-web/           Task 10 — React 18 + Vite
  admin-web/              Task 11 — React 18 + Vite
  consumer/               Task 12 — Expo + expo-router
landing/                  Task 13 — Next.js (App Router)
docs/
  openapi.json            the committed OpenAPI contract (74 paths / 82 operations)
  frontend-contract.md    this file
ops/
  docker-compose.yml            dev (db + redis only)
  docker-compose.prod.yml       prod (adds merchant-web/admin-web/landing services)
  docker-compose.staging.yml    staging (same, +10 ports)
```

## 2. What each app task may touch

**Your own app directory ONLY.** Specifically:

| Task | May touch | Must NOT touch |
|---|---|---|
| 10 (merchant-web) | `apps/merchant-web/**` | anything else |
| 11 (admin-web) | `apps/admin-web/**` | anything else |
| 12 (consumer) | `apps/consumer/**` | anything else |
| 13 (landing) | `landing/**` | anything else |

None of you need to touch: root `package.json` (workspaces already wired), `packages/api-client`, `packages/ui-tokens`, `ops/*.yml` (your compose services already exist), `.github/workflows/quality-gates.yml` (your `frontend-quality` job already covers you), or `backend/**` (CORS for your dev origin is already allowed — see §6).

If you find a genuine bug in `@kurtar/api-client` or `@kurtar/ui-tokens` (not just "I wish this had one more field"), don't patch around it in your app — flag it. A silent workaround in one app becomes a landmine for the other three.

Each app's placeholder (`App.tsx` / `src/app/index.tsx` / `app/page.tsx`) already renders a heading and calls `client.health.check()`. That's Task 9.5's job done — replace it with your real screens; you don't need to re-wire the client from scratch.

## 3. `@kurtar/api-client` — how to use it

### 3.1 Importing

```ts
import { createClient, KurtarApiError } from "@kurtar/api-client";
import type { AuthTokens } from "@kurtar/api-client";
```

Everything is derived from `packages/api-client/src/generated/openapi-types.ts`, which is generated FROM `docs/openapi.json` — never hand-edit that file. Regenerate with:

```
npm run generate -w @kurtar/api-client
```

CI (`frontend-quality` job) diffs the committed file against a fresh regeneration and fails if they differ — if `docs/openapi.json` changes (it shouldn't, from your side — that's backend's job), regenerate and commit the result.

### 3.2 Creating a client

```ts
const client = createClient({
  baseUrl: "http://localhost:4750",     // origin only — every operation path already starts with /api
  transport: "cookie" | "body",          // see §4 — one per surface, never mixed
  actor: "CONSUMER" | "MERCHANT" | "ADMIN",  // see §4.1 — required, picks the actor-scoped refresh/logout routes
  getAccessToken: () => accessToken,     // read from wherever YOUR app keeps it (state/ref/SecureStore)
  getRefreshToken: () => refreshToken,   // body transport only — omit for cookie transport
  onTokensIssued: (tokens) => { /* persist tokens.accessToken (+ .refreshToken for body transport) */ },
  onUnauthorized: () => { /* refresh itself failed — this is your real "log the user out" signal */ },
});
```

`getAccessToken`/`getRefreshToken` are called fresh on every request — don't cache a closure over a stale value. `onTokensIssued` fires after every successful login/verify/refresh; that's your only save point, there's no separate "read the current token back out" API.

### 3.3 Calling operations

Grouped by domain, matching the shape you'd expect:

```ts
client.auth.requestOtp(body)
client.auth.verifyOtp(body)              // -> ConsumerAuthResponseDto (accessToken + user)
client.auth.merchantLogin(body)          // -> MerchantAuthResponseDto (accessToken + user)
client.auth.adminLogin(body)             // -> AdminAuthResponseDto (accessToken + user)
client.auth.refresh(body?)               // -> AuthTokensDto (accessToken only — no `user`); routed to POST /auth/<your actor>/refresh
client.auth.logout(body?)                // routed to POST /auth/<your actor>/logout

client.merchant.signup(body)             // -> MerchantSignupResponseDto (accessToken + merchant)
client.merchant.submitForReview(body)
client.merchant.getMe()
client.merchant.getMembership()
client.merchant.stores.{create,list,get,update}(...)
client.merchant.bagTemplates.{create,list,get,update,deactivate}(...)   // list(query?) — storeId

client.offers.{create,publish,schedule,close,cancel}(...)
client.offers.listMine(query?)           // date
client.discovery.{offers,map,store,offer}(...)   // offer(id) — single-offer share-link preview, for landing
client.reservations.{create,cancel,redeem,rate}(...)
client.reservations.listMine(query)      // page, pageSize — both required
client.reservations.listForMerchant(query?)  // storeId, offerId, date, status[], page, pageSize — the merchant pickup list, distinct from listMine (consumer-scoped)
client.complaints.{create,get,addMessage,createReport}(...)
client.complaints.listMine(query?)       // status, page, pageSize
client.complaints.listAssigned(query?)   // status, page, pageSize
client.admin.merchants.{approve,reject,suspend}(...)
client.admin.merchants.list(query?)      // status, page, pageSize
client.admin.settlements.{runNightly,get,approve,hold,retry}(...)
client.admin.settlements.list(query?)    // status, merchantId, page, pageSize
client.admin.pricing.{list,schedule}(...)
client.admin.ratings.{approve,reject,remove}(...)
client.admin.ratings.list(query?)        // status, storeId, page, pageSize
client.admin.complaints.{get,resolve,escalate}(...)
client.admin.complaints.list(query?)     // status, category, merchantId, page, pageSize
client.admin.reports.{action,dismiss}(...)
client.admin.reports.list(query?)        // status, targetType, page, pageSize
client.admin.getDashboard()
client.admin.exports.{complaintsCsv,settlementsCsv,merchantsCsv}(query?)  // from, to — returns a string (CSV), not JSON
client.impact.{getMine,getPublic}()
client.favorites.{add,remove}(...)
client.favorites.listMine(query)         // page, pageSize — both required
client.ratings.listMine(query)           // storeId, page, pageSize — all required (yes, storeId too — see the method's own doc comment)
client.settlements.getMine(...)
client.settlements.listMine(query)       // page, pageSize — both required
client.account.notificationPreferences.{get,update}(...)
client.account.updateLocation(body)
client.account.pushTokens.{register,remove}(...)
client.health.check()
```

Every method's request/response types come straight from the generated types — path params as plain string args, query/body as typed objects matching the DTO. As of `docs/openapi.json`'s current state, every one of the 82 operations except `DELETE /admin/ratings/{id}` (a genuine no-body response) has a real, non-guessed response type — see §9. `POST /webhooks/payment` is deliberately NOT in the client — it's a server-to-server provider webhook, never called by a frontend.

**Every method that accepts `query` or `path` forwards EVERY parameter the operation declares** — this was a real, shipped bug for 8 methods (`reservations.listMine`, `merchant.bagTemplates.list`, `offers.listMine`, `settlements.listMine`, `favorites.listMine`, `ratings.listMine`, `complaints.listAssigned`, `complaints.listMine` each silently accepted zero arguments where the endpoint actually declares 1+ query params), fixed and now regression-tested: `packages/api-client/test/query-passthrough.spec.ts` derives the full list of query-bearing operations LIVE from `docs/openapi.json` and fails if any of them lacks a coverage entry proving its params reach the request URL — so a future contract change that adds a query param to any endpoint (existing or new) is caught automatically, not just the 8 that were already broken.

### 3.4 Error handling

Every thrown error is a `KurtarApiError`:

```ts
try {
  await client.offers.publish(id);
} catch (err) {
  if (err instanceof KurtarApiError) {
    if (err.errorCode === "OFFER_NOT_PUBLISHABLE") { /* branch on the CODE */ }
    console.log(err.statusCode, err.errorCode, err.message, err.isBackendErrorCode);
  }
}
```

`err.isBackendErrorCode` tells you whether `errorCode` came from the backend's own envelope or was derived client-side from Nest's default exception shape (e.g. `"Unauthorized"` -> `"UNAUTHORIZED"`) — most framework-level 401s (expired JWT, inactive account) fall into the derived bucket; business errors from `modules/*.service.ts` always carry a real `errorCode`. See §8 for the full catalogue.

`err.isNetworkError` (statusCode === 0) means the request never reached the server — handle that as "offline", not as an API error.

### 3.5 Single-flight refresh — READ THIS

The backend revokes a refresh token's **entire family** the moment an already-rotated token is presented again (`backend/src/modules/auth/services/token.service.ts`). If your screen fires several authenticated requests at once and they all 401 together, a client that fires one `/auth/<actor>/refresh` per 401 sends the same still-valid refresh token N times — only the first wins, every other one looks like token reuse, and the whole session gets killed for a real, currently-active user.

**This is already solved for you in `packages/api-client/src/engine.ts`** — every 401, no matter how many concurrent callers hit it, collapses into exactly ONE `/auth/<actor>/refresh` call; every caller then retries once with whatever token that single refresh produced. You don't need to do anything except call the client normally — do NOT add your own retry-on-401 logic on top, and do NOT call `client.auth.refresh()` yourself except for a genuinely proactive case (e.g. refreshing on app foreground before the access token's known 15m TTL expires). Unit-tested in `packages/api-client/test/engine.spec.ts` (N-concurrent-401 -> 1-refresh is the load-bearing test).

## 4. Transport rule — one per surface, never mixed

| Surface | `transport` | Why |
|---|---|---|
| apps/merchant-web | `"cookie"` | Browser session — refresh token lives ONLY in an httpOnly cookie |
| apps/admin-web | `"cookie"` | Same |
| landing | `"cookie"` | Same (landing has little/no authenticated surface, but if it ever calls an authenticated endpoint, stay consistent) |
| apps/consumer (Expo) | `"body"` | No meaningful cookie jar on native — refresh token comes back in the JSON body; persist it in `expo-secure-store`, never AsyncStorage/plain state |

Concretely: `"cookie"` transport sends `credentials: "include"` on every request and `X-Client-Transport: cookie` on the four auth-issuing calls (`otp/verify`, `merchant/login`, `admin/login`, and your actor's own `<actor>/refresh`) — this tells the backend to strip the refresh token out of the JSON body entirely and set it only as an httpOnly cookie (`backend/src/modules/auth/auth.controller.ts`'s `wantsCookieOnlyTransport`). `"body"` transport omits that header — the backend returns the refresh token in the JSON body every time, which is what `getRefreshToken`/`onTokensIssued` are for.

Never send `"cookie"` transport from a context with no real cookie jar (Expo) — you'd get a refresh token in neither the cookie nor the body and have nothing to persist.

### 4.1 Actor rule — every client declares whose session it manages

`createClient({ actor })` is **required** and picks the actor-scoped auth routes:

| Surface | `actor` | Refresh / logout routes | Refresh cookie |
|---|---|---|---|
| apps/merchant-web | `"MERCHANT"` | `POST /auth/merchant/{refresh,logout}` | `refreshToken_merchant`, path `/api/auth/merchant` |
| apps/admin-web | `"ADMIN"` | `POST /auth/admin/{refresh,logout}` | `refreshToken_admin`, path `/api/auth/admin` |
| apps/consumer | `"CONSUMER"` | `POST /auth/consumer/{refresh,logout}` | body transport — no cookie |
| landing | `"CONSUMER"` | (never called — no authenticated surface) | — |

There is **no shared `POST /auth/refresh`**. Every kurtar surface talks to the same backend origin, and a cookie is scoped by host+path — never by port, and never by which frontend set it. One shared refresh cookie for three actors meant whichever actor signed in last owned the browser's only session, logging out of one surface killed the other's, and any script on any same-site surface could trade that cookie for an access token belonging to whoever it happened to be. Per-actor names and paths mean the three sessions coexist and the browser never even transmits another actor's cookie; the backend additionally rejects a refresh token whose own principal type doesn't match the route it arrived on (`backend/src/modules/auth/services/token.service.ts`'s `expectedActor`), so the guarantee doesn't rest on cookie attributes alone.

## 5. `@kurtar/ui-tokens` — design tokens

```ts
import { colors, spacing, radii, typeScale } from "@kurtar/ui-tokens";
```

Plain TS constants — no CSS, no CSS-in-JS runtime, no DOM/RN imports — safe in Vite, Next, and Metro/Hermes alike.

**Palette rationale** (`packages/ui-tokens/src/colors.ts` has the full doc comment):
- `colors.primary` (`kurtarOrange`, base `#F2542D`) — warm, appetising tomato/sunset orange. Food marketplaces lean warm because it reads as appetising and carries urgency without alarm — apt for a product whose whole premise is "this bag disappears at closing time". This is the dominant brand hue — CTAs, brand marks.
- `colors.secondary` (`rescueGreen`, base `#1F7A46`) — the "rescued / eco" signal: sustainability, food-waste-avoided impact stats. Used as an ACCENT, deliberately less than primary, so it reads as "impact", not as competing with the appetite signal orange carries.
- `colors.semantic.{success,warning,danger,info}` — status/feedback, deliberately distinct hues from both brand colors (a warning must never look like "just the brand orange").
- `colors.neutral` — a warm-tinted (not pure) gray ramp, 0-1000, for text/borders/surfaces.

`spacing`/`radii`/`typeScale` values are **plain numbers**, not CSS strings — interpret them as px on web, dp on React Native. No unit suffix is ever baked in.

## 6. Dev servers, ports, and CORS

| Surface | Dev command | Dev origin | Prod port | Staging port |
|---|---|---|---|---|
| backend (api) | `npm run dev -w backend` | `http://localhost:4750` | 4750 | 4760 |
| apps/merchant-web | `npm run dev -w merchant-web` | `http://localhost:5173` | 4756 | 4766 |
| apps/admin-web | `npm run dev -w admin-web` | `http://localhost:5174` | 4757 | 4767 |
| landing | `npm run dev -w landing` | `http://localhost:3000` | 4758 | 4768 |
| apps/consumer | `npm run web -w consumer` (Expo web preview) | `http://localhost:8081` | n/a — EAS, not compose | n/a |
| db (postgis) | — | — | 4754 | 4764 |
| redis | — | — | 4755 | 4765 |

All four dev ports are **fixed**, not left to "pick the next free one" (`vite.config.ts` sets `server.port` + `strictPort: true`; `landing`'s `next dev -p 3000`) — the backend's CORS allowlist is keyed off these exact origins, so a moved port silently breaks cross-origin calls with no error message pointing at why.

`db`/`redis` don't run in the compose file at all for the frontend apps — start them with `docker compose -f ops/docker-compose.yml up -d`, then run `npm run dev -w backend` separately. Each app reads its own API base URL from an env var (see each app's own `.env.example`): `VITE_API_BASE_URL` (merchant-web, admin-web), `NEXT_PUBLIC_API_BASE_URL` (landing), `EXPO_PUBLIC_API_BASE_URL` (consumer) — all default to `http://localhost:4750`.

**CORS** (`backend/src/main.ts`, the one backend file Task 9.5 touched): additive, off by default. `CORS_ALLOWED_ORIGINS` (comma-separated) is the explicit override for any environment. Unset: development falls back to the four dev origins above; everywhere else (`NODE_ENV=production`) gets NO CORS at all until you set it explicitly — this is deliberate, not a bug, so a real deployment can't accidentally go live with an open CORS policy.

## 7. Auth flows

### 7.1 Consumer — phone OTP

```
POST /auth/otp/request  { phone }        -> client.auth.requestOtp({ phone })
POST /auth/otp/verify   { phone, code }  -> client.auth.verifyOtp({ phone, code })  -> ConsumerAuthResponseDto (accessToken + user)
```
`transport: "body"`. Persist `refreshToken` in `expo-secure-store`; keep `accessToken` in memory/React state (15m TTL — don't persist it, just let it be re-derived via refresh on next app open).

### 7.2 Merchant / admin — email + password

```
POST /auth/merchant/login  { email, password }  -> client.auth.merchantLogin(...)  -> MerchantAuthResponseDto (accessToken + user: {id,email,role,merchantId})
POST /auth/admin/login     { email, password }  -> client.auth.adminLogin(...)     -> AdminAuthResponseDto (accessToken + user: {id,email,name})
POST /merchants/signup     { ... }              -> client.merchant.signup(...)     -> MerchantSignupResponseDto (accessToken + merchant: {id,verificationStatus})
```
`transport: "cookie"`. `accessToken` comes back in the JSON body either way (keep it in memory/React state); the refresh token is stripped from the body and lives only in the httpOnly cookie — you never see it and never need to store it yourself. `merchant.signup` mints a session exactly like the two logins above (backend commit `7eb1bc2`) — it sends `X-Client-Transport: cookie` under cookie transport too; if you're calling it from a context where you're NOT going through `client.merchant.signup(...)` for some reason, make sure whatever you use sends that header, or the refresh token leaks into JS-readable JSON regardless of transport.

### 7.3 Merchant approval gate

A freshly-signed-up merchant is `PENDING` — most merchant-only endpoints 403 with `MERCHANT_NOT_APPROVED` until an admin approves them (`backend/src/modules/auth/guards/merchant-approval.guard.ts`). `client.merchant.getMe()` returns the current verification status so merchant-web can show the right "pending review" screen instead of a raw 403.

### 7.4 Logout

```
POST /auth/<actor>/logout  -> client.auth.logout()
```
Revokes the whole refresh-token family server-side. Call this, then clear whatever you persisted locally (SecureStore for consumer; nothing extra needed for cookie transport beyond clearing your in-memory access token, since the backend also clears the cookie).

## 8. Error-code catalogue

Real, backend-declared `errorCode` values (grep `errorCode:\s*"[A-Z_]+"` across `backend/src` for the source of truth — this list may grow as Tasks 10-13 surface new business rules):

```
ACCOUNT_BANNED                         MERCHANT_SIGNUP_INVALID_TAX_ID
BAG_PRICE_BELOW_FLOOR                  OFFER_DATE_ALREADY_EXISTS
BAG_PRICE_NOT_BELOW_VALUE              OFFER_DATE_INVALID
BAG_TEMPLATE_INACTIVE                  OFFER_NOT_CANCELLABLE
BAG_TEMPLATE_NOT_FOUND                 OFFER_NOT_CLOSEABLE
BAG_VALUE_BAND_INVALID                 OFFER_NOT_FOUND
COMPLAINT_NOT_FOUND                    OFFER_NOT_PUBLISHABLE
COMPLAINT_TRANSITION_INVALID           OFFER_NOT_SCHEDULABLE
DISCOVERY_BBOX_INVALID                 OFFER_PICKUP_WINDOW_PASSED
DISCOVERY_BBOX_TOO_LARGE               OFFER_SCHEDULE_NOT_FUTURE
DISCOVERY_DIET_INVALID                 OFFER_UNAVAILABLE
FORBIDDEN                              OFFER_WINDOW_NOT_FUTURE
MEMBERSHIP_NOT_FOUND                   OFFER_WINDOW_NOT_SAME_DAY
MERCHANT_ATTESTATION_REQUIRED          OFFER_WINDOW_START_NOT_BEFORE_END
MERCHANT_EMAIL_TAKEN                   PAYMENT_PROVIDER_UNAVAILABLE
MERCHANT_NOT_APPROVED                  PRICING_EFFECTIVE_FROM_NOT_FUTURE
MERCHANT_NOT_FOUND                     RATING_ALREADY_EXISTS
MERCHANT_NOT_SUBMITTABLE               RATING_NOT_ELIGIBLE
MERCHANT_NOT_SUSPENDABLE               RATING_NOT_FOUND
MERCHANT_SIGNUP_INVALID_IBAN           REPORT_ALREADY_HANDLED
REPORT_NOT_FOUND                       SETTLEMENT_PAYOUT_ALREADY_ATTEMPTED
RESERVATION_NOT_CANCELLABLE            STORE_COORDINATES_INCOMPLETE
RESERVATION_NOT_FOUND                  STORE_COORDINATES_INVALID
RESERVATION_NOT_REDEEMABLE             STORE_LOCATION_OUTSIDE_TURKEY
SETTLEMENT_BATCH_NOT_FOUND             STORE_NOT_FOUND
SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED
SETTLEMENT_NOT_APPROVABLE
SETTLEMENT_NOT_HOLDABLE
SETTLEMENT_NOT_RETRYABLE
```

Plus the derived-fallback family for framework-level errors with no custom code (`err.isBackendErrorCode === false`): `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `FORBIDDEN` (Nest's default `error` string, upper-snake-cased), or `HTTP_<status>` if even that's absent, or `NETWORK_ERROR` (statusCode 0) for a request that never reached the server. class-validator's `ValidationPipe` rejections return `message` as a `string[]` — the client joins it into one string; the individual field messages aren't separately exposed.

## 9. Response typing — fully resolved, zero hand-copied shapes

Every operation in `docs/openapi.json` now has a real, declared response schema (backend commit `117dd8c`) except `DELETE /admin/ratings/{id}`, which genuinely returns no body. An earlier revision of this doc documented a large gap here (65 of 81 operations untyped) and one hand-declared exception (`AuthTokens`, read by hand from the backend's `IssuedTokens` interface because the auth-issuing operations had no response schema at all) — both are resolved now: every domain method's return type, including all four auth-issuing calls and `merchant.signup`, is derived straight from the generated types with **zero hand-copied shapes anywhere in this package**. `AuthTokens` (`packages/api-client/src/transport.ts`) still exists as a name, but it's now a plain re-export of the generated `components["schemas"]["AuthTokensDto"]` — kept only because `CreateClientOptions.onTokensIssued` needs one stable shared type across every call site that can issue tokens. `verifyOtp`/`merchantLogin`/`adminLogin`/`signup` each return their OWN richer, actor-specific type (accessToken + a `user` or `merchant` object) — don't narrow their result to `AuthTokens` if you need those extra fields.

If a future backend change ever removes a response schema again (regressing an operation back to an untyped/no-content response), that's a real backend regression worth flagging — not something to work around with a cast in this package or in your app.

### A related, now-fixed bug: `Promise<never>`

Every domain method's COMPILED return type briefly resolved to `Promise<never>` — invisible to `tsc --noEmit` on source and to this package's runtime unit tests, only visible in the emitted `.d.ts` a real consumer's own `tsc` resolves against. Root cause: `openapi-typescript` emits response-status keys as NUMERIC literals (`201`, not `"201"`), and `SuccessBody`'s original conditional type checked `K extends \`2${string}\`` — a numeric literal never structurally matches a string template pattern, so the check was false for every key, unconditionally. Fixed in `core-types.ts` (stringify the key first: `` `${K}` extends `2${string}` ``) and regression-tested against the BUILT package specifically — `packages/api-client/test-types/build-output.types.ts`, run via `npm run typecheck:build`, imports `../dist` (not `../src`) and asserts real fields exist on several methods' awaited return types. If you ever see a kurtar API client method typed as `never` again, this is the first thing to check.

## 10. Known tooling footguns (already solved — read only if something breaks)

- **Vite + npm-workspace-symlinked packages, production build**: `vite build` (Rollup) fails with `"X is not exported by .../dist/index.js"` for `@kurtar/*` imports unless `resolve.preserveSymlinks: true` is set (already set in both `apps/merchant-web/vite.config.ts` and `apps/admin-web/vite.config.ts`) — Rollup's commonjs plugin only transforms paths matching `/node_modules/`, and without `preserveSymlinks` Vite resolves the workspace symlink to its real path OUTSIDE `node_modules/`, so the transform never runs. The dev server works fine either way (esbuild handles it); only the production build needs this.
- **Metro + npm workspaces**: `apps/consumer/metro.config.js` sets `watchFolders` + `nodeModulesPaths` + `resolver.disableHierarchicalLookup = true` (Expo's own documented monorepo pattern) so Metro can find `@kurtar/api-client`/`@kurtar/ui-tokens`, which npm hoists/symlinks to the repo root's `node_modules`, not `apps/consumer`'s own. Verified empirically — `npx expo export -p web` bundles both packages' code into the output (grep the bundle for `createClient`/`kurtarOrange` if you ever need to re-confirm).
- **`expo-doctor` always reports exactly two findings** in this monorepo, both expected, not defects — see the CI job's own comment (`.github/workflows/quality-gates.yml`, the `frontend-quality` job's Expo step) for the full explanation: the Metro config override above (flagged as "risky" by a generic heuristic that doesn't know about monorepos), and a duplicate `react`/`react-dom` (apps/merchant-web and apps/admin-web are pinned to React 18 per the brief; apps/consumer needs React 19 for its Expo SDK — the two never share a bundle or native build target). CI treats exactly these two, and only these two, as passing.
- **`expo lint`'s default `eslint.config.js` template doesn't work in this workspace**: it imports `eslint-config-expo/flat`, which npm hoists to the workspace ROOT's `node_modules` (nothing else needs it) — and that package internally does `require('eslint/config')`, a v9-only API, which then resolves against the ROOT's `eslint@8` (used by every other workspace here) instead of `apps/consumer`'s own nested `eslint@9`, and throws before linting ever runs. `apps/consumer/eslint.config.js` uses a hand-assembled flat config (`@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks`) instead — see that file's own comment.

## 11. CI

`.github/workflows/quality-gates.yml`'s `frontend-quality` job (blocking, no `continue-on-error`) runs, per workspace: lint, typecheck, and — for `@kurtar/api-client` — unit tests (including the single-flight refresh concurrency test AND the query-passthrough coverage sweep), a type-level regression check against the BUILT package (`npm run typecheck:build` — see §9), then production builds for merchant-web/admin-web/landing and `expo-doctor` for consumer. It also re-generates `@kurtar/api-client`'s types from `docs/openapi.json` and diffs against the committed file, mirroring the backend's own `openapi-contract-drift` job. It needs no database — the client's types come from the committed spec file, not a live server.

If you're extending `@kurtar/api-client`, run `npm run typecheck:build -w @kurtar/api-client` locally before pushing — `npm run typecheck` alone (source-only) is not sufficient to catch every class of bug this package has actually shipped (see §9's `Promise<never>` postmortem).
