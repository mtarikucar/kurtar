import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";

/** Trust & safety surface: consumer complaints (with SLA), merchant's assigned queue, and abuse reports. Used by apps/consumer and apps/merchant-web. */
export function createComplaintsDomain(engine: RequestEngine) {
  return {
    /** POST /complaints — consumer opens a complaint against a reservation. */
    create: (body: RequestBody<"/api/complaints", "post">) =>
      engine.request("post", "/api/complaints", { body }),

    /** GET /complaints/mine — the authenticated consumer's own complaints. */
    listMine: () => engine.request("get", "/api/complaints/mine"),

    /** GET /complaints/{id} — a single complaint's detail + message thread (consumer or assigned merchant). */
    get: (id: string) =>
      engine.request("get", "/api/complaints/{id}", { path: { id } }),

    /** POST /complaints/{id}/messages — adds a message to a complaint's thread. */
    addMessage: (
      id: string,
      body: RequestBody<"/api/complaints/{id}/messages", "post">,
    ) =>
      engine.request("post", "/api/complaints/{id}/messages", {
        path: { id },
        body,
      }),

    /** GET /complaints/assigned — merchant-side: complaints assigned to the authenticated merchant. */
    listAssigned: () => engine.request("get", "/api/complaints/assigned"),

    /** POST /reports — abuse/policy report against a store, offer, or rating (distinct from a per-reservation complaint). */
    createReport: (body: RequestBody<"/api/reports", "post">) =>
      engine.request("post", "/api/reports", { body }),
  };
}

export type ComplaintsDomain = ReturnType<typeof createComplaintsDomain>;
