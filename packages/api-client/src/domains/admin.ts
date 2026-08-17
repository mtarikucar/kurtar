import type { RequestEngine } from "../engine";
import type { QueryParams, RequestBody } from "../core-types";

/** Admin back-office: merchant approval, settlements, pricing, ratings/complaints/reports moderation, dashboard, CSV exports. Used by apps/admin-web. */
export function createAdminDomain(engine: RequestEngine) {
  return {
    merchants: {
      /** GET /admin/merchants */
      list: (query?: QueryParams<"/api/admin/merchants", "get">) =>
        engine.request("get", "/api/admin/merchants", { query }),
      /** POST /admin/merchants/{id}/approve */
      approve: (
        id: string,
        body: RequestBody<"/api/admin/merchants/{id}/approve", "post">,
      ) =>
        engine.request("post", "/api/admin/merchants/{id}/approve", {
          path: { id },
          body,
        }),
      /** POST /admin/merchants/{id}/reject */
      reject: (
        id: string,
        body: RequestBody<"/api/admin/merchants/{id}/reject", "post">,
      ) =>
        engine.request("post", "/api/admin/merchants/{id}/reject", {
          path: { id },
          body,
        }),
      /** POST /admin/merchants/{id}/suspend */
      suspend: (
        id: string,
        body: RequestBody<"/api/admin/merchants/{id}/suspend", "post">,
      ) =>
        engine.request("post", "/api/admin/merchants/{id}/suspend", {
          path: { id },
          body,
        }),
      /** [I7 fix] GET /admin/merchants/{id} — the audited KYC-detail read (docsJson, IBAN, verification history) an approver needs to actually judge a submission before approve/reject. Every read is audited server-side. */
      get: (id: string) =>
        engine.request("get", "/api/admin/merchants/{id}", { path: { id } }),
    },

    settlements: {
      /** GET /admin/settlements */
      list: (query?: QueryParams<"/api/admin/settlements", "get">) =>
        engine.request("get", "/api/admin/settlements", { query }),
      /** POST /admin/settlements/run-nightly — manually triggers the nightly settlement batch job. */
      runNightly: () =>
        engine.request("post", "/api/admin/settlements/run-nightly"),
      /** GET /admin/settlements/{id} */
      get: (id: string) =>
        engine.request("get", "/api/admin/settlements/{id}", { path: { id } }),
      /** POST /admin/settlements/{id}/approve */
      approve: (id: string) =>
        engine.request("post", "/api/admin/settlements/{id}/approve", {
          path: { id },
        }),
      /** POST /admin/settlements/{id}/hold */
      hold: (
        id: string,
        body: RequestBody<"/api/admin/settlements/{id}/hold", "post">,
      ) =>
        engine.request("post", "/api/admin/settlements/{id}/hold", {
          path: { id },
          body,
        }),
      /** POST /admin/settlements/{id}/retry */
      retry: (id: string) =>
        engine.request("post", "/api/admin/settlements/{id}/retry", {
          path: { id },
        }),
    },

    pricing: {
      /** GET /admin/pricing — pricing schedule (bag fee, membership fee) history. */
      list: () => engine.request("get", "/api/admin/pricing"),
      /** POST /admin/pricing — schedules a future pricing change. */
      schedule: (body: RequestBody<"/api/admin/pricing", "post">) =>
        engine.request("post", "/api/admin/pricing", { body }),
    },

    ratings: {
      /** GET /admin/ratings — ratings pending/flagged for moderation. */
      list: (query?: QueryParams<"/api/admin/ratings", "get">) =>
        engine.request("get", "/api/admin/ratings", { query }),
      /** POST /admin/ratings/{id}/approve */
      approve: (id: string) =>
        engine.request("post", "/api/admin/ratings/{id}/approve", {
          path: { id },
        }),
      /** POST /admin/ratings/{id}/reject */
      reject: (
        id: string,
        body: RequestBody<"/api/admin/ratings/{id}/reject", "post">,
      ) =>
        engine.request("post", "/api/admin/ratings/{id}/reject", {
          path: { id },
          body,
        }),
      /** DELETE /admin/ratings/{id} — removes a published rating (post-hoc takedown). */
      remove: (id: string) =>
        engine.request("delete", "/api/admin/ratings/{id}", { path: { id } }),
    },

    complaints: {
      /** GET /admin/complaints */
      list: (query?: QueryParams<"/api/admin/complaints", "get">) =>
        engine.request("get", "/api/admin/complaints", { query }),
      /** GET /admin/complaints/{id} */
      get: (id: string) =>
        engine.request("get", "/api/admin/complaints/{id}", { path: { id } }),
      /** POST /admin/complaints/{id}/resolve */
      resolve: (
        id: string,
        body: RequestBody<"/api/admin/complaints/{id}/resolve", "post">,
      ) =>
        engine.request("post", "/api/admin/complaints/{id}/resolve", {
          path: { id },
          body,
        }),
      /** POST /admin/complaints/{id}/escalate — also fired automatically by the SLA cron on breach; exposed here for a manual admin escalation too. */
      escalate: (id: string) =>
        engine.request("post", "/api/admin/complaints/{id}/escalate", {
          path: { id },
        }),
      /** [I3 fix] POST /admin/complaints/{id}/refund — refunds this complaint's linked reservation (only valid once REDEEMED); the make-whole action for a picked-up bad/missing/wrong bag. Does not itself resolve/escalate the ticket. */
      refund: (id: string) =>
        engine.request("post", "/api/admin/complaints/{id}/refund", {
          path: { id },
        }),
    },

    reports: {
      /** GET /admin/reports */
      list: (query?: QueryParams<"/api/admin/reports", "get">) =>
        engine.request("get", "/api/admin/reports", { query }),
      /** POST /admin/reports/{id}/action — takes moderation action on a report (e.g. store/offer takedown). */
      action: (
        id: string,
        body: RequestBody<"/api/admin/reports/{id}/action", "post">,
      ) =>
        engine.request("post", "/api/admin/reports/{id}/action", {
          path: { id },
          body,
        }),
      /** POST /admin/reports/{id}/dismiss */
      dismiss: (
        id: string,
        body: RequestBody<"/api/admin/reports/{id}/dismiss", "post">,
      ) =>
        engine.request("post", "/api/admin/reports/{id}/dismiss", {
          path: { id },
          body,
        }),
    },

    /** GET /admin/dashboard — today's platform-wide operational snapshot. */
    getDashboard: () => engine.request("get", "/api/admin/dashboard"),

    exports: {
      /** GET /admin/exports/complaints.csv — the ETAHS evidence trail. Response is `text/csv`, not JSON. */
      complaintsCsv: (
        query?: QueryParams<"/api/admin/exports/complaints.csv", "get">,
      ) =>
        engine.request("get", "/api/admin/exports/complaints.csv", { query }),
      /** GET /admin/exports/settlements.csv */
      settlementsCsv: (
        query?: QueryParams<"/api/admin/exports/settlements.csv", "get">,
      ) =>
        engine.request("get", "/api/admin/exports/settlements.csv", { query }),
      /** GET /admin/exports/merchants.csv */
      merchantsCsv: (
        query?: QueryParams<"/api/admin/exports/merchants.csv", "get">,
      ) => engine.request("get", "/api/admin/exports/merchants.csv", { query }),
    },
  };
}

export type AdminDomain = ReturnType<typeof createAdminDomain>;
