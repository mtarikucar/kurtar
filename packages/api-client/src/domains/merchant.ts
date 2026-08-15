import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";

/** Merchant back-office surface: onboarding, profile, membership, stores, bag templates. Used by apps/merchant-web. */
export function createMerchantDomain(engine: RequestEngine) {
  return {
    /** POST /merchants/signup — creates a merchant + its first MerchantUser (owner), status PENDING. */
    signup: (body: RequestBody<"/api/merchants/signup", "post">) =>
      engine.request("post", "/api/merchants/signup", { body }),

    /** POST /merchants/me/submit — submits the merchant's application for admin review. */
    submitForReview: (body: RequestBody<"/api/merchants/me/submit", "post">) =>
      engine.request("post", "/api/merchants/me/submit", { body }),

    /** GET /merchants/me — the authenticated merchant user's own merchant profile. */
    getMe: () => engine.request("get", "/api/merchants/me"),

    /** GET /merchants/me/membership — current annual membership status (required before publishing offers). */
    getMembership: () => engine.request("get", "/api/merchants/me/membership"),

    stores: {
      /** POST /stores */
      create: (body: RequestBody<"/api/stores", "post">) =>
        engine.request("post", "/api/stores", { body }),
      /** GET /stores */
      list: () => engine.request("get", "/api/stores"),
      /** GET /stores/{id} */
      get: (id: string) =>
        engine.request("get", "/api/stores/{id}", { path: { id } }),
      /** PATCH /stores/{id} */
      update: (id: string, body: RequestBody<"/api/stores/{id}", "patch">) =>
        engine.request("patch", "/api/stores/{id}", { path: { id }, body }),
    },

    bagTemplates: {
      /** POST /bag-templates */
      create: (body: RequestBody<"/api/bag-templates", "post">) =>
        engine.request("post", "/api/bag-templates", { body }),
      /** GET /bag-templates */
      list: () => engine.request("get", "/api/bag-templates"),
      /** GET /bag-templates/{id} */
      get: (id: string) =>
        engine.request("get", "/api/bag-templates/{id}", { path: { id } }),
      /** PATCH /bag-templates/{id} */
      update: (
        id: string,
        body: RequestBody<"/api/bag-templates/{id}", "patch">,
      ) =>
        engine.request("patch", "/api/bag-templates/{id}", {
          path: { id },
          body,
        }),
      /** DELETE /bag-templates/{id} — deactivates (soft), does not delete history. */
      deactivate: (id: string) =>
        engine.request("delete", "/api/bag-templates/{id}", { path: { id } }),
    },
  };
}

export type MerchantDomain = ReturnType<typeof createMerchantDomain>;
