import type { RequestEngine } from "../engine";
import type { QueryParams, RequestBody } from "../core-types";

/** Trust & safety surface: consumer complaints (with SLA), merchant's assigned queue, and abuse reports. Used by apps/consumer and apps/merchant-web. */
export function createComplaintsDomain(engine: RequestEngine) {
  return {
    /** POST /complaints — consumer opens a complaint against a reservation. */
    create: (body: RequestBody<"/api/complaints", "post">) =>
      engine.request("post", "/api/complaints", { body }),

    /** GET /complaints/mine — the authenticated consumer's own complaints, optionally filtered by status and paginated. */
    listMine: (query?: QueryParams<"/api/complaints/mine", "get">) =>
      engine.request("get", "/api/complaints/mine", { query }),

    /** GET /complaints/{id} — a single complaint's detail + message thread. CONSUMER-only (class-level @Actors("CONSUMER") on ComplaintsController) — a MERCHANT gets 403 here; use `getAssigned` instead. */
    get: (id: string) =>
      engine.request("get", "/api/complaints/{id}", { path: { id } }),

    /** [I18 fix] GET /complaints/assigned/{id} — the MERCHANT-scoped mirror of `get`: a single complaint assigned to the caller's own merchant, with its message thread. */
    getAssigned: (id: string) =>
      engine.request("get", "/api/complaints/assigned/{id}", {
        path: { id },
      }),

    /** POST /complaints/{id}/messages — adds a message to a complaint's thread. */
    addMessage: (
      id: string,
      body: RequestBody<"/api/complaints/{id}/messages", "post">,
    ) =>
      engine.request("post", "/api/complaints/{id}/messages", {
        path: { id },
        body,
      }),

    /** GET /complaints/assigned — merchant-side: complaints assigned to the authenticated merchant, optionally filtered by status and paginated. */
    listAssigned: (query?: QueryParams<"/api/complaints/assigned", "get">) =>
      engine.request("get", "/api/complaints/assigned", { query }),

    /** POST /reports — abuse/policy report against a store, offer, or rating (distinct from a per-reservation complaint). */
    createReport: (body: RequestBody<"/api/reports", "post">) =>
      engine.request("post", "/api/reports", { body }),
  };
}

export type ComplaintsDomain = ReturnType<typeof createComplaintsDomain>;
