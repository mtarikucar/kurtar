import type { RequestEngine } from "../engine";
import type { QueryParams, RequestBody } from "../core-types";

/** Merchant-side daily-offer lifecycle: create -> publish|schedule -> close|cancel. Used by apps/merchant-web. */
export function createOffersDomain(engine: RequestEngine) {
  return {
    /** POST /offers */
    create: (body: RequestBody<"/api/offers", "post">) =>
      engine.request("post", "/api/offers", { body }),

    /** GET /offers/mine — the authenticated merchant's own offers, optionally filtered to one calendar day (`date`). Omit for today. */
    listMine: (query?: QueryParams<"/api/offers/mine", "get">) =>
      engine.request("get", "/api/offers/mine", { query }),

    /** POST /offers/{id}/publish — makes the offer live for discovery immediately. */
    publish: (id: string) =>
      engine.request("post", "/api/offers/{id}/publish", { path: { id } }),

    /** POST /offers/{id}/schedule — schedules the offer to go live at a future pickup window. */
    schedule: (
      id: string,
      body: RequestBody<"/api/offers/{id}/schedule", "post">,
    ) =>
      engine.request("post", "/api/offers/{id}/schedule", {
        path: { id },
        body,
      }),

    /** POST /offers/{id}/close — ends the offer's sale window early (no more reservations). */
    close: (id: string) =>
      engine.request("post", "/api/offers/{id}/close", { path: { id } }),

    /** POST /offers/{id}/cancel — cancels the offer, refunding any outstanding reservations. */
    cancel: (id: string) =>
      engine.request("post", "/api/offers/{id}/cancel", { path: { id } }),
  };
}

export type OffersDomain = ReturnType<typeof createOffersDomain>;
