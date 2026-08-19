/**
 * KEŞİF — pure logic for the discovery list (spec §4.1).
 *
 * Kept out of the screen component so the sort order, the distance-tier
 * grouping, the filter → query mapping and the collapsing map header's
 * math are all unit-testable without rendering anything.
 */

import type { BagCategory, DiscoveryOfferItem } from "./api-types";
import {
  glyphSec,
  kalanDakika,
  kis,
  teklifDurumu,
  type VitrinTeklifi,
} from "../components/kepenk";

// ---------------------------------------------------------------------
// Offer -> card mapping
// ---------------------------------------------------------------------

/** `DiscoveryOfferItem` (the API's field names) -> `VitrinTeklifi` (the
 * card's field names, spec §3). A straight rename, no derived values —
 * every VitrinKarti prop the card computes (gauge, value ratio, gauge
 * light) is computed FROM these, never duplicated here. */
export function teklifeCevir(offer: DiscoveryOfferItem): VitrinTeklifi {
  return {
    teklifId: offer.offerId,
    dukkanId: offer.store.id,
    dukkanAdi: offer.store.name,
    paketAdi: offer.template.title,
    kategori: offer.template.category,
    fiyatKurus: offer.template.priceCents,
    degerMinKurus: offer.template.originalValueCentsMin,
    degerMaxKurus: offer.template.originalValueCentsMax,
    alisBaslangic: offer.pickupStartAt,
    alisBitis: offer.pickupEndAt,
    kalanAdet: offer.qtyLeft,
    mesafeM: offer.store.distanceM,
  };
}

// ---------------------------------------------------------------------
// Filter chips (spec §4.1: "TÜMÜ · FIRIN · PASTANE · MANAV · KAFE · MUTFAK")
// ---------------------------------------------------------------------

export type KesifKategorisi =
  | "TUMU"
  | "FIRIN"
  | "PASTANE"
  | "MANAV"
  | "KAFE"
  | "MUTFAK";

export const KESIF_KATEGORILERI: readonly KesifKategorisi[] = Object.freeze([
  "TUMU",
  "FIRIN",
  "PASTANE",
  "MANAV",
  "KAFE",
  "MUTFAK",
]);

/**
 * The six chips the spec names do not line up 1:1 with the API's five
 * `BagCategory` values: FIRIN and PASTANE are both `BAKERY` server-side —
 * a pastane and a fırın are the same category to the backend and not the
 * same shop to anyone standing in front of one, which is exactly the
 * distinction `glyphSec()` already draws for the card's glyph (see
 * glyphs.ts). So the API call narrows to `BAKERY` for either chip, and
 * `eslesiyorMu` below does the fırın/pastane split client-side, reusing
 * that same exported helper rather than re-deriving the name heuristic.
 *
 * `GROCERY` has no chip of its own — the spec's six chips don't name one,
 * and there are no seeded grocery offers to design a chip around yet.
 * Grocery offers still surface under TÜMÜ.
 */
const KATEGORI_API: Readonly<
  Record<Exclude<KesifKategorisi, "TUMU">, BagCategory>
> = Object.freeze({
  FIRIN: "BAKERY",
  PASTANE: "BAKERY",
  MANAV: "PRODUCE",
  KAFE: "OTHER",
  MUTFAK: "MEAL",
});

/** The chip -> `GET /discovery/offers?category=` mapping. `null` for
 * TÜMÜ (no server-side category filter at all). */
export function kategoriSorgusu(secim: KesifKategorisi): BagCategory | null {
  if (secim === "TUMU") return null;
  return KATEGORI_API[secim];
}

/** The client-side half of the FIRIN/PASTANE split — applied AFTER the
 * server has already scoped the response to `BAKERY`. Every other chip
 * is a straight server-side category match, so this is a no-op pass for
 * them. */
export function eslesiyorMu(secim: KesifKategorisi, offer: DiscoveryOfferItem): boolean {
  if (secim !== "FIRIN" && secim !== "PASTANE") return true;
  const glyph = glyphSec(offer.template.category, offer.store.name);
  return secim === "PASTANE" ? glyph === "pastane" : glyph !== "pastane";
}

// ---------------------------------------------------------------------
// Sort + distance-tier grouping (spec §4.1: "by closing time ascending
// within distance tiers, not by price")
// ---------------------------------------------------------------------

export type KesifSatiri =
  | { readonly tip: "bolum"; readonly anahtar: string; readonly tur: "bolge"; readonly bolge: string }
  | { readonly tip: "bolum"; readonly anahtar: string; readonly tur: "kacirdiklarin" }
  | { readonly tip: "teklif"; readonly anahtar: string; readonly teklif: VitrinTeklifi };

/**
 * Groups OPEN offers by `store.district` — the distance tier this app
 * actually has data for (the API gives district, not neighbourhood; the
 * spec's "YELDEĞİRMENİ" / "BEŞİKTAŞ · vapurla 20 dk" mock is illustrative
 * of the SHAPE — grouped sections down a street spine — not a literal
 * neighbourhood field or a travel-mode estimate this app has any honest
 * way to compute, so this reads district names, not fabricated transit
 * times; see build log §4). Districts are ordered by their own nearest
 * offer ascending — the tier closest to the user leads — and every
 * district's offers are sorted by closing time ascending inside it: the
 * scarce resource is time, not price.
 *
 * Sold-out offers never sit inside a district group — spec §3: they sink
 * to a trailing "KAÇIRDIKLARIN" section, most-recently-closed first, so
 * scarcity is felt rather than hidden without cluttering the live list.
 */
export function sokakListesi(
  offers: readonly DiscoveryOfferItem[],
  simdi: Date,
): KesifSatiri[] {
  const acik: DiscoveryOfferItem[] = [];
  const tukendi: DiscoveryOfferItem[] = [];
  for (const offer of offers) {
    const durum = teklifDurumu(
      offer.qtyLeft,
      new Date(offer.pickupStartAt),
      new Date(offer.pickupEndAt),
      simdi,
    );
    (durum === "tukendi" ? tukendi : acik).push(offer);
  }

  const bolgeler = new Map<string, DiscoveryOfferItem[]>();
  for (const offer of acik) {
    const liste = bolgeler.get(offer.store.district);
    if (liste) liste.push(offer);
    else bolgeler.set(offer.store.district, [offer]);
  }

  const siraliBolgeler = [...bolgeler.entries()].sort(([, a], [, b]) => {
    const enYakinA = Math.min(...a.map((o) => o.store.distanceM));
    const enYakinB = Math.min(...b.map((o) => o.store.distanceM));
    return enYakinA - enYakinB;
  });

  const satirlar: KesifSatiri[] = [];
  for (const [bolge, liste] of siraliBolgeler) {
    satirlar.push({ tip: "bolum", anahtar: `bolum-${bolge}`, tur: "bolge", bolge });
    const kapanmayaGore = [...liste].sort(
      (a, b) =>
        kalanDakika(simdi, new Date(a.pickupEndAt)) -
        kalanDakika(simdi, new Date(b.pickupEndAt)),
    );
    for (const offer of kapanmayaGore) {
      satirlar.push({ tip: "teklif", anahtar: offer.offerId, teklif: teklifeCevir(offer) });
    }
  }

  if (tukendi.length > 0) {
    satirlar.push({ tip: "bolum", anahtar: "bolum-kacirdiklarin", tur: "kacirdiklarin" });
    const enSonKapananOnce = [...tukendi].sort(
      (a, b) => new Date(b.pickupEndAt).getTime() - new Date(a.pickupEndAt).getTime(),
    );
    for (const offer of enSonKapananOnce) {
      satirlar.push({ tip: "teklif", anahtar: offer.offerId, teklif: teklifeCevir(offer) });
    }
  }

  return satirlar;
}

/**
 * "Open" for a header COUNT means genuinely accepting pickups right now —
 * `acilmadi` (window hasn't started) is deliberately excluded here, even
 * though it stays in the normal street flow as its own card variant (spec
 * §3: "The same object reads 'opening', not only 'closing'"). A "4 dükkân
 * açık" claim that includes shops not open yet would be false, which is
 * exactly the kind of number this app does not print without earning it.
 */
export function acikMi(offer: DiscoveryOfferItem, simdi: Date): boolean {
  return (
    teklifDurumu(
      offer.qtyLeft,
      new Date(offer.pickupStartAt),
      new Date(offer.pickupEndAt),
      simdi,
    ) === "acik"
  );
}

/** The district this "area" header copy names (spec §4.1: "Kadıköy'de 11
 * kepenk hâlâ açık") — the district with the most OPEN offers, ties
 * broken by whichever is closest. `null` when there are no open offers
 * to name a district from. */
export function baskinBolge(offers: readonly DiscoveryOfferItem[], simdi: Date): string | null {
  const sayimlar = new Map<string, { adet: number; enYakin: number }>();
  for (const offer of offers) {
    if (!acikMi(offer, simdi)) continue;
    const mevcut = sayimlar.get(offer.store.district) ?? { adet: 0, enYakin: Infinity };
    sayimlar.set(offer.store.district, {
      adet: mevcut.adet + 1,
      enYakin: Math.min(mevcut.enYakin, offer.store.distanceM),
    });
  }
  let secilen: string | null = null;
  let enIyi: { adet: number; enYakin: number } | null = null;
  for (const [bolge, deger] of sayimlar) {
    if (
      !enIyi ||
      deger.adet > enIyi.adet ||
      (deger.adet === enIyi.adet && deger.enYakin < enIyi.enYakin)
    ) {
      secilen = bolge;
      enIyi = deger;
    }
  }
  return secilen;
}

/** Past this many OPEN offers the header copy switches from "N dükkân
 * açık" to "{district}'de N kepenk hâlâ açık" (spec §4.1). */
export const BASLIK_ESIGI = 8;

// ---------------------------------------------------------------------
// The collapsing map header (spec §4.1: "168pt → 56pt", "the first 112pt
// of scroll")
// ---------------------------------------------------------------------

export const HARITA_ISTIRAHAT = 168;
export const HARITA_DARALTILMIS = 56;
export const HARITA_KAYDIRMA_ESIGI = 112;

/** Container height for a given list scroll offset — the only thing that
 * animates. The `MapView`/`MapPane` inside stays a constant
 * `HARITA_ISTIRAHAT` tall and is translated, never resized (spec §4.1 /
 * §5.12: resizing a live map is the most expensive thing on this
 * screen). */
export function haritaYuksekligi(scrollY: number): number {
  const ilerleme = kis(scrollY / HARITA_KAYDIRMA_ESIGI, 0, 1);
  return HARITA_ISTIRAHAT - ilerleme * (HARITA_ISTIRAHAT - HARITA_DARALTILMIS);
}

/** How far the constant-height map translates up as the container clips
 * it from the bottom, so the collapsed sliver still shows the part of the
 * map nearest the street (pins, the "SEN" marker) rather than a strip of
 * empty sky at the very top of the tile. */
export function haritaKaydirmaY(yukseklik: number): number {
  return -(HARITA_ISTIRAHAT - yukseklik);
}

// ---------------------------------------------------------------------
// The night-empty countdown (spec §4.8: "a countdown to tomorrow")
// ---------------------------------------------------------------------

/** The evening window's usual opening hour, per §4.8's own copy ("Yarın
 * 17:00'den itibaren…" / "İlk paketler 17:00 civarı çıkar"). */
export const ACILIS_SAATI = 17;

/**
 * Milliseconds until the next 17:00 **Europe/Istanbul**, regardless of
 * the device's own timezone — matching every other business instant this
 * app renders (lib/format.ts pins the same zone explicitly). A real
 * computed countdown, never a placeholder duration.
 */
export function sonrakiAcilisaMs(simdi: Date): number {
  const parcalar = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(simdi);
  const al = (tip: string) => Number(parcalar.find((p) => p.type === tip)?.value ?? 0);
  const simdiSaniye = al("hour") * 3600 + al("minute") * 60 + al("second");
  const hedefSaniye = ACILIS_SAATI * 3600;
  const farkSaniye = hedefSaniye - simdiSaniye;
  const GUN_SANIYE = 86_400;
  return (farkSaniye <= 0 ? farkSaniye + GUN_SANIYE : farkSaniye) * 1000;
}
