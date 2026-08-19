/**
 * The card's arithmetic — spec §2 and §3. Pure, so the gauge, the value
 * bar and every string on the card are unit-testable without rendering.
 */

export type KepenkDurumu = "acik" | "acilmadi" | "tukendi";

/** The gauge's horizon: three hours. Everything further out reads the
 * same, because at that range the answer is "plenty of time". */
export const H_DK = 180;

/** A 5pt lintel at ≥3sa: the shutter box, i.e. the shop is wide open. */
export const P_ALT = 0.08;
/** The hard cap. The gauge is bounded to its own band and may never
 * occlude the shop name, the price, the value bar or the pickup window
 * (spec §2 / §5.13). */
export const P_UST = 0.78;

export function kis(deger: number, alt: number, ust: number): number {
  return Math.min(Math.max(deger, alt), ust);
}

/**
 * How far the shutter has rolled down = how little time is left.
 *
 * Normalised to ABSOLUTE minutes, never to the shop's own window: 0.69
 * means 56 minutes on any card in the list, which is the only job the
 * gauge has. A per-shop fraction would compare a manav on a 30-minute
 * window with a fırın on a five-hour one and mean nothing.
 *
 * The clamp is on the OUTSIDE of the subtraction — inside it, three hours
 * out reads 22% instead of 8%.
 */
export function kepenkP(kalanDk: number, durum: KepenkDurumu): number {
  if (durum === "tukendi") return 1; // the only state allowed past the cap
  if (durum === "acilmadi") return P_UST; // window not open yet
  return kis(1 - kalanDk / H_DK, P_ALT, P_UST);
}

/** Minutes from `simdi` to `an`, floored, never negative. */
export function kalanDakika(simdi: Date, an: Date): number {
  return Math.max(0, Math.floor((an.getTime() - simdi.getTime()) / 60_000));
}

export function teklifDurumu(
  kalanAdet: number,
  baslangic: Date,
  bitis: Date,
  simdi: Date,
): KepenkDurumu {
  if (kalanAdet <= 0) return "tukendi";
  if (simdi.getTime() >= bitis.getTime()) return "tukendi";
  if (simdi.getTime() < baslangic.getTime()) return "acilmadi";
  return "acik";
}

/** Under this, the time pill flips to awning red (spec §3). */
export const ACIL_DK = 30;

/**
 * How hard the shop burns, 0..1 — the other half of the gauge.
 *
 * The shutter tells you how little time is left by MOVING; the light
 * tells you by BURNING, and it burns hotter as the gap narrows. A shop
 * with twenty minutes to run is the most alive thing in the list: a
 * nearly-shut front with sodium knifing out of a 15pt slit. A shop with
 * three hours is wide open and merely warm.
 *
 * Two states emit nothing at all, and that is what separates the two
 * frames that would otherwise be the same picture: a shop that has NOT
 * OPENED YET is shut and dark, and a SOLD OUT shop is shut and dark. Only
 * a closing shop is shut and blazing.
 */
export function isikGucu(p: number, durum: KepenkDurumu): number {
  if (durum !== "acik") return 0;
  return kis(0.34 + 0.85 * p, 0.34, 1);
}

/**
 * Value comparator (spec §3). Fuller = BETTER deal — the direction every
 * progress bar the user has ever met runs, and the direction D3 had
 * backwards.
 */
export function degerOrani(
  dusukKurus: number,
  yuksekKurus: number,
  fiyatKurus: number,
): number {
  if (fiyatKurus <= 0) return 1;
  return (dusukKurus + yuksekKurus) / 2 / fiyatKurus;
}

export function degerDolulugu(oran: number): number {
  return kis((oran - 1) / 3, 0.04, 1);
}

/** Humans subitize to four; past that a dot row at 9pt in bad light is a
 * serial count, so past four it is a number (spec §3). */
export const STOK_NOKTA_SINIRI = 4;
/** At or below this the chip flips to an awning-red fill. */
export const STOK_ALARM_SINIRI = 2;

// ---------------------------------------------------------------------
// Turkish formatting (spec §1.2): comma decimal, dot thousands, ₺ AFTER
// the numeral with no space, 24-hour time throughout.
// ---------------------------------------------------------------------

const TR = "tr-TR";

export function sayi(deger: number, enFazlaBasamak = 0): string {
  return deger.toLocaleString(TR, {
    maximumFractionDigits: enFazlaBasamak,
    minimumFractionDigits: 0,
  });
}

export function fiyatMetni(kurus: number): string {
  const lira = kurus / 100;
  // Whole lira print bare ("149₺"); kuruş always print both digits
  // ("49,90₺", never "49,9₺") — a price with one decimal reads as an
  // approximation, and money in this app is never approximate.
  const metin = Number.isInteger(lira)
    ? sayi(lira, 0)
    : lira.toLocaleString(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${metin}₺`;
}

export function degerBandiMetni(dusukKurus: number, yuksekKurus: number): string {
  return `${sayi(Math.round(dusukKurus / 100))}–${sayi(Math.round(yuksekKurus / 100))}₺`;
}

export function katMetni(oran: number): string {
  return `×${sayi(oran, 1)}`;
}

/** "2 sa 26 dk" / "56 dk" — the number welded to the shutter's lip. */
export function sureMetni(dk: number): { saat: number; dakika: number } {
  const guvenli = Math.max(0, Math.floor(dk));
  return { saat: Math.floor(guvenli / 60), dakika: guvenli % 60 };
}

export function mesafeMetni(metre: number): string {
  if (metre < 1000) return `${Math.round(metre)} m`;
  return `${sayi(metre / 1000, 1)} km`;
}

/** 80 m a minute — a normal pace on a Kadıköy pavement. */
export const YURUME_HIZI_M_DK = 80;

export function yurumeDakikasi(metre: number): number {
  return Math.max(1, Math.round(metre / YURUME_HIZI_M_DK));
}

/** Past this the walking figure stops being useful and the meta rail
 * carries distance alone. */
export const YURUME_UST_SINIRI_M = 2500;
