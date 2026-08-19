import { describe, it, expect } from "vitest";
import { OfferPreview } from "@/components/OfferPreview";
import { extractTextDeep } from "./react-element-text";

const labels = {
  panelTitle: "SÜRPRİZ PAKET",
  pickupLabel: "Alım",
  valueLabel: "Değeri",
  priceLabel: "Fiyatı",
  body: "Bu paketi kurtar uygulamasından alabilirsin.",
};

const offer = {
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

function metin(node: Parameters<typeof extractTextDeep>[0]): string {
  return extractTextDeep(node, []).join(" ");
}

describe("OfferPreview", () => {
  it("names the shop, its district and the bag", () => {
    const metni = metin(OfferPreview({ offer, locale: "tr", labels }));

    expect(metni).toContain("Ada Fırın");
    expect(metni).toContain("Kadıköy");
    expect(metni).toContain("Sürpriz Fırın Paketi");
  });

  it("prints the window, the value band and the price İstanbul-side and in ₺", () => {
    const metni = metin(OfferPreview({ offer, locale: "tr", labels }));

    // 15:30–18:00 UTC is 18:30–21:00 in İstanbul; a container running on
    // UTC must not print the raw hours.
    expect(metni).toContain("18:30–21:00");
    expect(metni).toContain("₺100–150");
    expect(metni).toContain("₺49,90");
  });

  it("never invents a struck-through original price", () => {
    const metni = metin(OfferPreview({ offer, locale: "tr", labels }));

    // The value BAND is the comparator; a single "was" price would be a
    // number nobody ever charged.
    expect(metni).not.toContain("₺150,00");
  });

  it("formats money the English way for the en locale", () => {
    const metni = metin(OfferPreview({ offer, locale: "en", labels }));

    expect(metni).toContain("49.90");
    // The clock stays 24-hour and İstanbul-side in both locales.
    expect(metni).toContain("18:30–21:00");
  });
});
