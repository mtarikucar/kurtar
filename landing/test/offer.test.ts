import { describe, it, expect, vi, afterEach } from "vitest";
import { getOfferPreview } from "@/lib/offer";

/**
 * The data half of the share-link bridge (test/offer-bridge-page.test.tsx
 * covers the render half). Same contract, and for the same reason, as
 * test/impact.test.ts: this is a marketing page that must never 500
 * because the backend blinked — and a share link is precisely the URL
 * that gets opened days later, when the bag it names is long gone and the
 * endpoint answers 404.
 *
 * The real `@kurtar/api-client` request path runs; only `global.fetch` is
 * stubbed, so a genuine failure degrades through the code the page runs
 * in production rather than through a mock of it.
 */
const ORIGINAL_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

const OFFER_BODY = {
  offerId: "offer-1",
  store: { id: "store-1", name: "Ada Fırın", district: "Kadıköy" },
  template: {
    title: "Sürpriz Fırın Paketi",
    category: "BAKERY",
    dietFlags: [],
    priceCents: 4990,
    originalValueCentsMin: 10000,
    originalValueCentsMax: 15000,
    allergenDisclaimer: "Fındık içerir.",
  },
  pickupStartAt: "2026-08-19T15:30:00.000Z",
  pickupEndAt: "2026-08-19T18:00:00.000Z",
  qtyLeft: 3,
  coverImageUrl: null,
};

describe("getOfferPreview", () => {
  it("resolves to unavailable, without throwing, when NEXT_PUBLIC_API_BASE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    await expect(getOfferPreview("offer-1")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("resolves to unavailable when the backend is unreachable", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    await expect(getOfferPreview("offer-1")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("resolves to unavailable for a bag that has sold out or closed (404)", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 404, message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getOfferPreview("offer-1")).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("reads the shop, the bag, the money and the window off a real response", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(OFFER_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getOfferPreview("offer-1")).resolves.toEqual({
      status: "ok",
      offerId: "offer-1",
      storeName: "Ada Fırın",
      district: "Kadıköy",
      bagTitle: "Sürpriz Fırın Paketi",
      priceCents: 4990,
      originalValueCentsMin: 10000,
      originalValueCentsMax: 15000,
      pickupStartAt: "2026-08-19T15:30:00.000Z",
      pickupEndAt: "2026-08-19T18:00:00.000Z",
      qtyLeft: 3,
    });
  });

  it("calls the single-offer endpoint the backend actually exposes", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    const stub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(OFFER_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = stub;

    await getOfferPreview("offer-1");

    const url = String(stub.mock.calls[0][0]);
    expect(url).toContain("/api/discovery/offers/offer-1");
  });
});
