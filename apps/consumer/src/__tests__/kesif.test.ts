import {
  BASLIK_ESIGI,
  HARITA_DARALTILMIS,
  HARITA_ISTIRAHAT,
  HARITA_KAYDIRMA_ESIGI,
  baskinBolge,
  eslesiyorMu,
  haritaKaydirmaY,
  haritaYuksekligi,
  kategoriSorgusu,
  sokakListesi,
  sonrakiAcilisaMs,
  teklifeCevir,
} from "../lib/kesif";
import type { DiscoveryOfferItem } from "../lib/api-types";

function teklif(over: Partial<DiscoveryOfferItem> = {}): DiscoveryOfferItem {
  return {
    offerId: "offer-1",
    store: { id: "store-1", name: "Moda Fırın", district: "Kadıköy", distanceM: 400 },
    template: {
      title: "Fırından Sürpriz Paket",
      category: "BAKERY",
      dietFlags: [],
      priceCents: 6900,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 22000,
    },
    pickupStartAt: "2026-08-19T15:30:00.000Z",
    pickupEndAt: "2026-08-19T18:00:00.000Z",
    qtyLeft: 5,
    coverImageUrl: null,
    ...over,
  } as DiscoveryOfferItem;
}

describe("teklifeCevir — DiscoveryOfferItem -> VitrinTeklifi", () => {
  it("renames every field straight through, deriving nothing", () => {
    const offer = teklif();
    expect(teklifeCevir(offer)).toEqual({
      teklifId: "offer-1",
      dukkanId: "store-1",
      dukkanAdi: "Moda Fırın",
      paketAdi: "Fırından Sürpriz Paket",
      kategori: "BAKERY",
      fiyatKurus: 6900,
      degerMinKurus: 15000,
      degerMaxKurus: 22000,
      alisBaslangic: "2026-08-19T15:30:00.000Z",
      alisBitis: "2026-08-19T18:00:00.000Z",
      kalanAdet: 5,
      mesafeM: 400,
    });
  });
});

describe("kategoriSorgusu — chip -> API category", () => {
  it("TÜMÜ sends no category filter", () => {
    expect(kategoriSorgusu("TUMU")).toBeNull();
  });
  it("FIRIN and PASTANE both narrow the server query to BAKERY", () => {
    expect(kategoriSorgusu("FIRIN")).toBe("BAKERY");
    expect(kategoriSorgusu("PASTANE")).toBe("BAKERY");
  });
  it("MANAV / KAFE / MUTFAK map 1:1 to their real category", () => {
    expect(kategoriSorgusu("MANAV")).toBe("PRODUCE");
    expect(kategoriSorgusu("KAFE")).toBe("OTHER");
    expect(kategoriSorgusu("MUTFAK")).toBe("MEAL");
  });
});

describe("eslesiyorMu — the client-side fırın/pastane split", () => {
  it("a fırın name passes FIRIN and fails PASTANE", () => {
    const firin = teklif({ store: { id: "s", name: "Moda Fırın", district: "Kadıköy", distanceM: 1 } as never });
    expect(eslesiyorMu("FIRIN", firin)).toBe(true);
    expect(eslesiyorMu("PASTANE", firin)).toBe(false);
  });
  it("a pastane name passes PASTANE and fails FIRIN", () => {
    const pastane = teklif({
      store: { id: "s", name: "Yeldeğirmeni Pastanesi", district: "Kadıköy", distanceM: 1 } as never,
    });
    expect(eslesiyorMu("PASTANE", pastane)).toBe(true);
    expect(eslesiyorMu("FIRIN", pastane)).toBe(false);
  });
  it("every other chip is a pass-through (server already scoped it)", () => {
    const manav = teklif({ template: { ...teklif().template, category: "PRODUCE" } });
    expect(eslesiyorMu("MANAV", manav)).toBe(true);
    expect(eslesiyorMu("TUMU", manav)).toBe(true);
  });
});

describe("sokakListesi — distance-tier grouping + closing-time sort", () => {
  const simdi = new Date("2026-08-19T16:00:00.000Z");

  it("groups open offers by district, nearest district's tier first", () => {
    const kadikoy = teklif({
      offerId: "a",
      store: { id: "s1", name: "A", district: "Kadıköy", distanceM: 2000 },
    });
    const besiktas = teklif({
      offerId: "b",
      store: { id: "s2", name: "B", district: "Beşiktaş", distanceM: 500 },
    });
    const satirlar = sokakListesi([kadikoy, besiktas], simdi);
    const bolumler = satirlar.filter((s) => s.tip === "bolum");
    expect(bolumler).toEqual([
      { tip: "bolum", anahtar: "bolum-Beşiktaş", tur: "bolge", bolge: "Beşiktaş" },
      { tip: "bolum", anahtar: "bolum-Kadıköy", tur: "bolge", bolge: "Kadıköy" },
    ]);
  });

  it("sorts offers within a district by closing time ascending, not by price or distance", () => {
    const closesLater = teklif({
      offerId: "far-close",
      template: { ...teklif().template, priceCents: 1000 },
      pickupEndAt: "2026-08-19T20:00:00.000Z",
      store: { id: "s1", name: "A", district: "Kadıköy", distanceM: 100 },
    });
    const closesSoon = teklif({
      offerId: "near-close",
      template: { ...teklif().template, priceCents: 99900 },
      pickupEndAt: "2026-08-19T16:20:00.000Z",
      store: { id: "s2", name: "B", district: "Kadıköy", distanceM: 900 },
    });
    const satirlar = sokakListesi([closesLater, closesSoon], simdi);
    const teklifler = satirlar.filter((s) => s.tip === "teklif");
    expect(teklifler.map((s) => (s.tip === "teklif" ? s.teklif.teklifId : null))).toEqual([
      "near-close",
      "far-close",
    ]);
  });

  it("sinks sold-out offers into a trailing KAÇIRDIKLARIN section, most recently closed first", () => {
    const open = teklif({ offerId: "open-1", qtyLeft: 3 });
    const soldOut1 = teklif({
      offerId: "sold-1",
      qtyLeft: 0,
      pickupEndAt: "2026-08-19T15:00:00.000Z",
    });
    const soldOut2 = teklif({
      offerId: "sold-2",
      qtyLeft: 0,
      pickupEndAt: "2026-08-19T15:45:00.000Z",
    });
    const satirlar = sokakListesi([open, soldOut1, soldOut2], simdi);
    const kacirdiklarinIndex = satirlar.findIndex(
      (s) => s.tip === "bolum" && s.tur === "kacirdiklarin",
    );
    expect(kacirdiklarinIndex).toBeGreaterThan(0);
    const sonrasi = satirlar.slice(kacirdiklarinIndex + 1);
    expect(sonrasi.map((s) => (s.tip === "teklif" ? s.teklif.teklifId : null))).toEqual([
      "sold-2",
      "sold-1",
    ]);
  });

  it("omits the KAÇIRDIKLARIN section entirely when nothing is sold out", () => {
    const satirlar = sokakListesi([teklif()], simdi);
    expect(satirlar.some((s) => s.tip === "bolum" && s.tur === "kacirdiklarin")).toBe(false);
  });

  it("a closed pickup window (simdi past pickupEndAt) counts as sold out too", () => {
    const kapanmis = teklif({ qtyLeft: 5, pickupEndAt: "2026-08-19T10:00:00.000Z" });
    const satirlar = sokakListesi([kapanmis], new Date("2026-08-19T16:00:00.000Z"));
    expect(satirlar[0]).toMatchObject({ tip: "bolum", tur: "kacirdiklarin" });
  });
});

describe("baskinBolge — the district the header names", () => {
  const simdi = new Date("2026-08-19T16:00:00.000Z");

  it("picks the district with the most open offers", () => {
    const offers = [
      teklif({ offerId: "1", store: { id: "s1", name: "A", district: "Kadıköy", distanceM: 100 } }),
      teklif({ offerId: "2", store: { id: "s2", name: "B", district: "Kadıköy", distanceM: 200 } }),
      teklif({ offerId: "3", store: { id: "s3", name: "C", district: "Beşiktaş", distanceM: 50 } }),
    ];
    expect(baskinBolge(offers, simdi)).toBe("Kadıköy");
  });

  it("ignores sold-out offers when counting", () => {
    const offers = [
      teklif({ offerId: "1", qtyLeft: 0, store: { id: "s1", name: "A", district: "Kadıköy", distanceM: 100 } }),
      teklif({ offerId: "2", store: { id: "s2", name: "B", district: "Beşiktaş", distanceM: 50 } }),
    ];
    expect(baskinBolge(offers, simdi)).toBe("Beşiktaş");
  });

  it("returns null when there is nothing open", () => {
    expect(baskinBolge([], simdi)).toBeNull();
  });

  it("ignores offers whose window hasn't opened yet — 'açık' means genuinely open, not merely not-sold-out", () => {
    const offers = [
      teklif({
        offerId: "1",
        pickupStartAt: "2026-08-19T17:00:00.000Z", // starts AFTER simdi (16:00)
        store: { id: "s1", name: "A", district: "Kadıköy", distanceM: 100 },
      }),
      teklif({ offerId: "2", store: { id: "s2", name: "B", district: "Beşiktaş", distanceM: 50 } }),
    ];
    expect(baskinBolge(offers, simdi)).toBe("Beşiktaş");
  });

  it("BASLIK_ESIGI is the documented threshold of 8", () => {
    expect(BASLIK_ESIGI).toBe(8);
  });
});

describe("the collapsing map header's math (spec §4.1: 168pt -> 56pt over 112pt of scroll)", () => {
  it("is at rest (168) at scroll 0", () => {
    expect(haritaYuksekligi(0)).toBe(HARITA_ISTIRAHAT);
  });
  it("is fully collapsed (56) at and past the 112pt threshold", () => {
    expect(haritaYuksekligi(HARITA_KAYDIRMA_ESIGI)).toBe(HARITA_DARALTILMIS);
    expect(haritaYuksekligi(500)).toBe(HARITA_DARALTILMIS);
  });
  it("is exactly halfway at half the threshold", () => {
    expect(haritaYuksekligi(HARITA_KAYDIRMA_ESIGI / 2)).toBe(
      (HARITA_ISTIRAHAT + HARITA_DARALTILMIS) / 2,
    );
  });
  it("never goes negative for a negative (bounce/overscroll) offset", () => {
    expect(haritaYuksekligi(-50)).toBe(HARITA_ISTIRAHAT);
  });
  it("the map translates up by exactly the height lost, never resizing", () => {
    expect(haritaKaydirmaY(HARITA_ISTIRAHAT)).toBeCloseTo(0);
    expect(haritaKaydirmaY(HARITA_DARALTILMIS)).toBe(
      -(HARITA_ISTIRAHAT - HARITA_DARALTILMIS),
    );
  });
});

describe("sonrakiAcilisaMs — the night-empty state's real countdown (spec §4.8)", () => {
  it("counts forward to 17:00 Istanbul later today", () => {
    // 14:00 Istanbul (UTC+3) = 11:00 UTC.
    const simdi = new Date("2026-08-19T11:00:00.000Z");
    expect(sonrakiAcilisaMs(simdi)).toBe(3 * 60 * 60 * 1000);
  });

  it("rolls to tomorrow's 17:00 once today's has passed", () => {
    // 20:00 Istanbul = 17:00 UTC — 3 hours past today's 17:00.
    const simdi = new Date("2026-08-19T17:00:00.000Z");
    expect(sonrakiAcilisaMs(simdi)).toBe(21 * 60 * 60 * 1000);
  });

  it("is exactly zero (rolls a full day forward) at 17:00:00 Istanbul on the nose", () => {
    // 17:00:00 Istanbul = 14:00:00 UTC.
    const simdi = new Date("2026-08-19T14:00:00.000Z");
    expect(sonrakiAcilisaMs(simdi)).toBe(24 * 60 * 60 * 1000);
  });

  it("is independent of the device's own timezone", () => {
    const simdi = new Date("2026-08-19T11:00:00.000Z");
    const gercekTZ = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(sonrakiAcilisaMs(simdi)).toBe(3 * 60 * 60 * 1000);
    } finally {
      process.env.TZ = gercekTZ;
    }
  });
});
