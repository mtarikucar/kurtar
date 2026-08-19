import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OfferPreview } from "@/components/OfferPreview";
import { extractTextDeep } from "./react-element-text";

const mockGetOfferPreview = vi.hoisted(() => vi.fn());

/** Every hookless, server-side component this page's content lives in.
 * `OfferAppOpener` is deliberately absent: it is a client component with
 * hooks, and calling it outside a render is a React error, not a test. */
const ACILABILIR: readonly unknown[] = [OfferPreview];

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values
        ? `offerBridge.${key}(${Object.values(values).join("|")})`
        : `offerBridge.${key}`;
    return t;
  }),
}));

vi.mock("@/lib/offer", () => ({ getOfferPreview: mockGetOfferPreview }));

import OfferBridgePage, { generateMetadata } from "@/app/[locale]/o/[id]/page";

const OFFER = {
  status: "ok" as const,
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
};

async function sayfaMetni(locale: "tr" | "en" = "tr") {
  const tree = await OfferBridgePage({
    params: Promise.resolve({ locale, id: "offer-1" }),
  });
  return extractTextDeep(tree, ACILABILIR).join(" ");
}

/**
 * [M24] A share link's single highest-leverage moment is the instant the
 * recipient opens it, and the bridge page spent it on a blank "open the
 * app" panel — no shop, no price, no pickup window. The stated reason
 * ("there is no public get-one-offer endpoint") stopped being true when
 * discovery.controller.ts gained `GET offers/:id`; apps/consumer's own
 * /o/[id] screen has been calling it all along.
 */
describe("OfferBridgePage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it("shows the shop, the bag, the price and the pickup window", async () => {
    mockGetOfferPreview.mockResolvedValue(OFFER);

    const metin = await sayfaMetni("tr");

    expect(metin).toContain("Ada Fırın");
    expect(metin).toContain("Kadıköy");
    expect(metin).toContain("Sürpriz Fırın Paketi");
    expect(metin).toContain("₺49,90");
    expect(metin).toContain("18:30–21:00");
  });

  it("keeps today's generic bridge when the offer can no longer be read", async () => {
    mockGetOfferPreview.mockResolvedValue({ status: "unavailable" });

    const metin = await sayfaMetni("tr");

    expect(metin).toContain("offerBridge.title");
    expect(metin).toContain("offerBridge.downloadCta");
    expect(metin).not.toContain("Ada Fırın");
  });

  it("still offers the app-store CTAs alongside the preview", async () => {
    mockGetOfferPreview.mockResolvedValue(OFFER);

    const metin = await sayfaMetni("tr");

    expect(metin).toContain("offerBridge.downloadCta");
    expect(metin).toContain("offerBridge.webCta");
  });
});

/**
 * The og card is what a group chat unfurls above a link nobody has
 * tapped: it used to carry the same generic title/description for every
 * bag ever shared.
 */
describe("OfferBridgePage.generateMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the shop, the price and the window in the share card", async () => {
    mockGetOfferPreview.mockResolvedValue(OFFER);

    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "tr" as const, id: "offer-1" }),
    });

    expect(String(meta.title)).toContain("Ada Fırın");
    expect(meta.description).toContain("₺49,90");
    expect(meta.description).toContain("18:30–21:00");
    expect(meta.description).toContain("Kadıköy");
  });

  it("falls back to the generic card when the offer cannot be read", async () => {
    mockGetOfferPreview.mockResolvedValue({ status: "unavailable" });

    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "tr" as const, id: "offer-1" }),
    });

    expect(String(meta.title)).toContain("offerBridge.title");
    expect(meta.description).toContain("offerBridge.body");
  });
});
