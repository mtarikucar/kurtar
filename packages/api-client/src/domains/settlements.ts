import type { RequestEngine } from "../engine";

/** Merchant-side settlement/payout reads. (Admin settlement operations — running the nightly batch, approve/hold/retry — live under `admin.settlements`.) Used by apps/merchant-web. */
export function createSettlementsDomain(engine: RequestEngine) {
  return {
    /** GET /settlements/mine — the authenticated merchant's settlement batches. */
    listMine: () => engine.request("get", "/api/settlements/mine"),

    /** GET /settlements/mine/{id} — a single settlement batch's detail. */
    getMine: (id: string) =>
      engine.request("get", "/api/settlements/mine/{id}", { path: { id } }),
  };
}

export type SettlementsDomain = ReturnType<typeof createSettlementsDomain>;
