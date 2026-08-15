import type { RequestEngine } from "../engine";

/** Impact-ledger reads (kg saved, CO2e avoided). Used by apps/consumer (personal) and landing (public/marketing totals). */
export function createImpactDomain(engine: RequestEngine) {
  return {
    /** GET /me/impact — the authenticated consumer's personal impact totals. */
    getMine: () => engine.request("get", "/api/me/impact"),

    /** GET /impact/public — @Public platform-wide impact totals, for marketing surfaces. */
    getPublic: () => engine.request("get", "/api/impact/public"),
  };
}

export type ImpactDomain = ReturnType<typeof createImpactDomain>;
