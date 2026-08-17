import { createClient } from "@kurtar/api-client";

/**
 * Discriminated result for the public impact counter (home page). This is
 * the ONE function on the site that talks to a live backend at render
 * time, so it carries the "the marketing site must never 500 because the
 * backend blinked" requirement (task-13 brief, `/` bullet) alone: every
 * failure mode (network unreachable, non-2xx, malformed body, missing
 * env var) is caught here and turned into `{ status: "unavailable" }`,
 * never a thrown error or rejected promise. Callers (the home page
 * Server Component, and this file's own test) can rely on
 * `getPublicImpact` resolving unconditionally.
 */
export type ImpactSnapshot =
  | {
      status: "ok";
      mealsSaved: number;
      co2eGrams: number;
      moneySavedCents: number;
    }
  | { status: "unavailable" };

/**
 * `GET /api/impact/public` is itself served from a 5-minute Redis cache
 * on the backend (impact.service.ts) — mirroring that here with Next's
 * fetch cache means a burst of concurrent page renders on this side
 * coalesces to one upstream request per revalidate window too, and (more
 * importantly for this page) a `next build`/`next start` run with the
 * backend unreachable fails fast into the catch branch below instead of
 * hanging on a live request.
 */
const REVALIDATE_SECONDS = 300;

function resolveApiBaseUrl(): string | undefined {
  // Deliberately allowed to be undefined — task-13 brief's own test
  // requirement: "no page throws when NEXT_PUBLIC_API_URL is unset."
  // createClient() requires a baseUrl string, so an unset env var is
  // handled as an immediate "unavailable" rather than passed through as
  // `undefined` (which would build a URL like "undefined/api/...").
  return process.env.NEXT_PUBLIC_API_BASE_URL;
}

export async function getPublicImpact(): Promise<ImpactSnapshot> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) return { status: "unavailable" };

  try {
    const client = createClient({
      baseUrl,
      transport: "cookie",
      // Landing has no authenticated surface at all; CONSUMER is the
      // actor its public reads notionally belong to. It never mints or
      // refreshes a session, so this only ever selects a route it does
      // not call.
      actor: "CONSUMER",
      getAccessToken: () => null, // landing has no authenticated surface
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, next: { revalidate: REVALIDATE_SECONDS } }),
    });
    // @kurtar/api-client GAP (flagged, not silently worked around — see
    // this task's report): frontend-contract.md §9 documents
    // `impact.getPublic` as one of the 16 FULLY TYPED operations, and the
    // backend controller does carry a real `@ApiOkResponse({ type:
    // PublicImpactTotalsDto })` (backend/src/modules/impact/impact.
    // controller.ts) that generates a correct response schema in
    // generated/openapi-types.ts (`PublicImpactController_getPublic`'s
    // 200 response really does reference `PublicImpactTotalsDto`).
    // Despite that, EVERY domain method's compiled dist/*.d.ts resolves
    // to `Promise<never>` — not just this one operation — because
    // `SuccessBody<P, M>` (packages/api-client/src/core-types.ts), a
    // mapped/conditional type computed from generic params, doesn't
    // resolve to a concrete type at declaration-emit time inside
    // engine.ts's own generic `request<M, P>` method; `tsc -p
    // tsconfig.json`'s `.d.ts` output falls back to `never` for the
    // return type of every domain function in dist/domains/*.d.ts (see
    // e.g. dist/domains/discovery.d.ts, dist/domains/favorites.d.ts —
    // this is universal, not impact-specific). Runtime behavior is
    // unaffected (the real JSON body comes back fine); only the TS type
    // is wrong. Cast here, at the app layer, per frontend-contract.md
    // §9's own prescribed pattern for an untyped operation — the shape
    // below is read from the real backend/src/modules/impact/dto/
    // impact-response.dto.ts, not guessed.
    const totals = (await client.impact.getPublic()) as unknown as {
      mealsSaved: number;
      co2eGrams: number;
      moneySavedCents: number;
    };
    return {
      status: "ok",
      mealsSaved: totals.mealsSaved,
      co2eGrams: totals.co2eGrams,
      moneySavedCents: totals.moneySavedCents,
    };
  } catch {
    // Network error, non-2xx (KurtarApiError), or any other failure —
    // all degrade identically to a static fallback. The specific error
    // is deliberately not logged here: a marketing page's render path
    // should not depend on a logging sink either.
    return { status: "unavailable" };
  }
}
