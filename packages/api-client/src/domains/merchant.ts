import type { RequestEngine } from "../engine";
import type { QueryParams, RequestBody } from "../core-types";
import type { ClientTransport } from "../transport";

/** Merchant back-office surface: onboarding, profile, membership, stores, bag templates. Used by apps/merchant-web. */
export function createMerchantDomain(
  engine: RequestEngine,
  transport: ClientTransport,
) {
  // Sent on signup for the same reason auth.ts sends it on every other
  // session-minting call: signup mints a full token pair too (backend/src/
  // modules/merchants/merchants.controller.ts routes it through the SAME
  // respondWithTokens()/wantsCookieOnlyTransport() convention as /auth/*
  // as of commit 7eb1bc2) — omitting this header on a cookie-transport
  // client meant the 30-day refresh token still came back in JS-readable
  // JSON, defeating the httpOnly cookie's XSS protection for exactly the
  // token it exists to protect.
  const cookieTransportHeader = transport === "cookie";

  return {
    /** POST /merchants/signup — creates a merchant + its first MerchantUser (owner, status PENDING) and issues a token pair + the merchant's own profile. */
    signup: (body: RequestBody<"/api/merchants/signup", "post">) =>
      engine.request("post", "/api/merchants/signup", {
        body,
        cookieTransportHeader,
      }),

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
      /** GET /bag-templates — optionally scoped to one store. */
      list: (query?: QueryParams<"/api/bag-templates", "get">) =>
        engine.request("get", "/api/bag-templates", { query }),
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
