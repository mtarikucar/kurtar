import type { VitrinTeklifi } from "./VitrinKarti";

/**
 * The four offers the seeded API is serving right now
 * (`GET /api/discovery/offers`), verbatim: ids, names, categories,
 * prices, value bands, stock and distances. The review screen and the
 * card tests both design against these rather than against invented
 * data, because the things that break a card — a 22-character shop name,
 * a value band that is only 1,6× the price, a single package left — are
 * all properties of the real rows.
 *
 * The pickup window is pinned to the canonical 18:30–21:00 evening the
 * spec works through, so the six simulated times have a fixed anchor.
 */

const GUN = "2026-08-19";
/** 18:30 Europe/Istanbul (UTC+3). */
export const ALIS_BASLANGIC = `${GUN}T15:30:00.000Z`;
/** 21:00 Europe/Istanbul. */
export const ALIS_BITIS = `${GUN}T18:00:00.000Z`;

export const GERCEK_TEKLIFLER: readonly VitrinTeklifi[] = Object.freeze([
  Object.freeze({
    teklifId: "kd-demo-offer-2-today",
    dukkanId: "kd-demo-store-2",
    dukkanAdi: "Yeldeğirmeni Pastanesi",
    paketAdi: "Pastane Sürpriz Kutusu",
    kategori: "BAKERY",
    fiyatKurus: 14900,
    degerMinKurus: 28000,
    degerMaxKurus: 38000,
    alisBaslangic: ALIS_BASLANGIC,
    alisBitis: ALIS_BITIS,
    kalanAdet: 1,
    mesafeM: 405,
  }),
  Object.freeze({
    teklifId: "kd-demo-offer-1-today",
    dukkanId: "kd-demo-store-1",
    dukkanAdi: "Moda Fırın",
    paketAdi: "Fırından Sürpriz Paket",
    kategori: "BAKERY",
    fiyatKurus: 6900,
    degerMinKurus: 15000,
    degerMaxKurus: 22000,
    alisBaslangic: ALIS_BASLANGIC,
    alisBitis: ALIS_BITIS,
    kalanAdet: 6,
    mesafeM: 1244,
  }),
  Object.freeze({
    teklifId: "kd-demo-offer-5-today",
    dukkanId: "kd-demo-store-5",
    dukkanAdi: "Beşiktaş Manav Ali Usta",
    paketAdi: "Manav Sürpriz Kutusu",
    kategori: "PRODUCE",
    fiyatKurus: 9900,
    degerMinKurus: 18000,
    degerMaxKurus: 26000,
    alisBaslangic: ALIS_BASLANGIC,
    alisBitis: ALIS_BITIS,
    kalanAdet: 7,
    mesafeM: 6114,
  }),
  Object.freeze({
    teklifId: "kd-demo-offer-6-today",
    dukkanId: "kd-demo-store-6",
    dukkanAdi: "Levent Fırın",
    paketAdi: "Fırından Sürpriz Paket",
    kategori: "BAKERY",
    fiyatKurus: 6900,
    degerMinKurus: 15000,
    degerMaxKurus: 22000,
    alisBaslangic: ALIS_BASLANGIC,
    alisBitis: ALIS_BITIS,
    kalanAdet: 5,
    mesafeM: 10290,
  }),
]);

/** Minutes before the window closes, i.e. the six frames the gauge has to
 * get right (spec §6, Phase 1). */
export interface IncelemeAni {
  readonly anahtar: string;
  readonly simdi: Date;
  /** Force the stock to zero for the sold-out frame. */
  readonly tukendi?: boolean;
  /**
   * A longer window for the frames that need one. Three hours before it
   * closes, an 18:30–21:00 evening has not opened yet — so the 3sa frame
   * is a fırın on a long window, which is exactly the case the gauge's
   * absolute-minute normalisation exists to make comparable (spec §2).
   */
  readonly baslangic?: string;
}

function kapanmaya(dk: number): Date {
  return new Date(new Date(ALIS_BITIS).getTime() - dk * 60_000);
}

/** 16:30 Europe/Istanbul — a four-and-a-half hour fırın window. */
export const UZUN_BASLANGIC = `${GUN}T13:30:00.000Z`;

export const INCELEME_ANLARI: readonly IncelemeAni[] = Object.freeze([
  Object.freeze({
    anahtar: "zaman3sa",
    simdi: kapanmaya(180),
    baslangic: UZUN_BASLANGIC,
  }),
  Object.freeze({ anahtar: "zaman90dk", simdi: kapanmaya(90) }),
  Object.freeze({ anahtar: "zaman56dk", simdi: kapanmaya(56) }),
  Object.freeze({ anahtar: "zaman20dk", simdi: kapanmaya(20) }),
  Object.freeze({
    anahtar: "zamanAcilmadi",
    simdi: new Date(new Date(ALIS_BASLANGIC).getTime() - 45 * 60_000),
  }),
  Object.freeze({ anahtar: "zamanTukendi", simdi: kapanmaya(90), tukendi: true }),
]);
