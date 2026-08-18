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
    // [M10 fix] The double-cast this comment used to justify is gone —
    // `SuccessBody<P, M>` (packages/api-client/src/core-types.ts) now
    // resolves to a concrete type at declaration-emit time (the
    // numeric-key template-literal coercion), so `dist/domains/impact.d.ts`
    // correctly types `getPublic` as `Promise<{ mealsSaved, co2eGrams,
    // moneySavedCents, count, generatedAt }>`, not `Promise<never>`. Both
    // other web surfaces already completed this same migration (see
    // apps/merchant-web/src/api/response-types.ts and
    // apps/admin-web/src/api/admin-types.ts, both citing commit e5621a3).
    const totals = await client.impact.getPublic();
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
