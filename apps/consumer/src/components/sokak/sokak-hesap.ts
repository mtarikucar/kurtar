/**
 * SENİN SOKAĞIN — the arithmetic (spec §4.7).
 *
 * Pure, so the street's grouping, the height/brightness of a repeat-visit
 * storefront, and the two derived stat lines ("en sık kurtardığın saat",
 * "en çok gittiğin dükkân") are unit-testable without rendering anything.
 *
 * What this module deliberately does NOT do: recompute mealsSaved / co2e /
 * moneySaved. Those three are rendered exactly as `GET /me/impact` returns
 * them (task brief: "Impact numbers are rendered as the API returns them,
 * never recomputed on the client"). Everything here is a different kind of
 * number — a shape derived from the caller's own reservation history, which
 * has no backend endpoint of its own.
 */
import { kis } from "../kepenk/olcum";

const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

export interface KurtarmaKaydi {
  readonly reservationId: string;
  readonly storeId: string;
  /** The moment the bag was actually handed over. */
  readonly redeemedAt: Date;
}

export interface AySokagi {
  /** "2026-08" — Istanbul-calendar month, sort-stable. */
  readonly anahtar: string;
  /** "Ağustos 2026" — Intl tr-TR, not a hand-rolled table. */
  readonly etiket: string;
  /** Chronological within the month (oldest first). */
  readonly kayitlar: readonly KurtarmaKaydi[];
}

function ayAnahtari(tarih: Date): string {
  // en-CA formats as YYYY-MM-DD, which sorts and slices cleanly — the
  // locale is a formatting trick, not a user-facing choice.
  const parcalar = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: ISTANBUL_TIME_ZONE,
  }).formatToParts(tarih);
  const yil = parcalar.find((p) => p.type === "year")?.value ?? "0000";
  const ay = parcalar.find((p) => p.type === "month")?.value ?? "01";
  return `${yil}-${ay}`;
}

function ayEtiketi(tarih: Date): string {
  const metin = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: ISTANBUL_TIME_ZONE,
  }).format(tarih);
  // tr-TR already capitalises the month name correctly (Ağustos, not
  // ağustos) — no trUpper() here, this is sentence case, not a label.
  return metin;
}

/**
 * Chronological, oldest month first — "scrolling left walks back to where
 * you started" (spec), so the street's natural reading order is left =
 * earliest, right = most recent, and the caller opens the scroll view at
 * the right (far) edge.
 */
export function aylaraGrupla(kayitlar: readonly KurtarmaKaydi[]): AySokagi[] {
  const gruplar = new Map<string, KurtarmaKaydi[]>();
  const siraliGiris = [...kayitlar].sort(
    (a, b) => a.redeemedAt.getTime() - b.redeemedAt.getTime(),
  );
  for (const kayit of siraliGiris) {
    const anahtar = ayAnahtari(kayit.redeemedAt);
    const grup = gruplar.get(anahtar);
    if (grup) grup.push(kayit);
    else gruplar.set(anahtar, [kayit]);
  }
  return [...gruplar.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([anahtar, kayitlar]) => ({
      anahtar,
      etiket: ayEtiketi(kayitlar[0]!.redeemedAt),
      kayitlar,
    }));
}

/** How many times each shop appears across the WHOLE history — a shop
 * rescued three times in March and twice in June is still "5 kez" (spec:
 * "shops you rescued from more than once are drawn taller and brighter",
 * describing the shop's standing, not a per-month reset). */
export function dukkanZiyaretSayilari(
  kayitlar: readonly KurtarmaKaydi[],
): Map<string, number> {
  const sayaclar = new Map<string, number>();
  for (const kayit of kayitlar) {
    sayaclar.set(kayit.storeId, (sayaclar.get(kayit.storeId) ?? 0) + 1);
  }
  return sayaclar;
}

/** One-time visit's storefront height — deliberately short: the height
 * RANGE has to be wide enough that a regular's building reads as
 * unmistakably taller, not just a few points different (a narrow range
 * is what made an early pass of this screen read as a bar chart — see
 * SeninSokagin.tsx's own note on the window inset for the other half of
 * that fix). */
export const DUKKAN_TABAN_YUKSEKLIK = 16;
/** Per repeat visit, capped — see DUKKAN_TEKRAR_TAVANI. */
const DUKKAN_ADIM_YUKSEKLIK = 7;
/** Same subitizing logic as the card's stock chip (spec §3): past four
 * repeats there is nothing more to FEEL by growing the shape further. */
export const DUKKAN_TEKRAR_TAVANI = 4;

/** Taller for a shop rescued more than once, bounded so a regular's
 * storefront cannot swallow the street. Monotonic, and flat at/above the
 * cap. */
export function dukkanYuksekligi(sayac: number): number {
  const tekrar = kis(sayac - 1, 0, DUKKAN_TEKRAR_TAVANI - 1);
  return DUKKAN_TABAN_YUKSEKLIK + tekrar * DUKKAN_ADIM_YUKSEKLIK;
}

/** A single-visit window is a dim glow, not a bright block — a uniformly
 * bright row of similarly-saturated rectangles is indistinguishable from
 * a bar chart's fill regardless of how the heights vary. Spreading the
 * lit range from "just visible" to "the brightest thing on the row"
 * makes a regular's storefront read as MORE ALIVE, not just taller —
 * which is the whole point of the repeat-visit reward. */
const DUKKAN_TABAN_PARLAKLIK = 0.3;

/** Brighter for a shop rescued more than once — 0..1, the window's lit
 * opacity. A single visit is still lit (this is a street of shops you
 * DID rescue, never a dim one), a regular's window is the brightest thing
 * on the row. */
export function dukkanParlakligi(sayac: number): number {
  const tekrar = kis(sayac - 1, 0, DUKKAN_TEKRAR_TAVANI - 1);
  const oran = tekrar / (DUKKAN_TEKRAR_TAVANI - 1);
  return DUKKAN_TABAN_PARLAKLIK + oran * (1 - DUKKAN_TABAN_PARLAKLIK);
}

function hexRgb(hex: string): readonly [number, number, number] {
  const temiz = hex.replace("#", "");
  return [
    Number.parseInt(temiz.slice(0, 2), 16),
    Number.parseInt(temiz.slice(2, 4), 16),
    Number.parseInt(temiz.slice(4, 6), 16),
  ];
}

/**
 * The window's own colour, not just its opacity — an opacity-only fill
 * over the street's dark ground reads as a half-transparent bar; lerping
 * from the phase's OWN unlit-interior colour (`vitrinZemin` — "the inside
 * of a shop with the lamp off") up to the bright sodium light makes every
 * storefront a solid, opaque object regardless of how dim it is, so a
 * once-off shop is a real dark building with a faint window rather than
 * a ghost.
 */
export function dukkanPencereRengi(
  vitrinZeminHex: string,
  isikCekirdekHex: string,
  parlaklik: number,
): string {
  const oran = kis(parlaklik, 0, 1);
  const [r1, g1, b1] = hexRgb(vitrinZeminHex);
  const [r2, g2, b2] = hexRgb(isikCekirdekHex);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * oran);
  return `rgb(${lerp(r1, r2)},${lerp(g1, g2)},${lerp(b1, b2)})`;
}

/** Scallops on the awning's own path — how many pointed teeth hang off
 * its bottom edge. */
export const TENTE_DIS_SAYISI = 3;

/**
 * The awning as a fabric canopy, not a plain rectangle: a scalloped
 * (pinked) bottom edge — the standard shorthand for a shop awning in
 * every icon set that draws one, and it shares nothing with chart
 * iconography, which never puts a zigzag on a bar's cap. Still exactly
 * ONE shape (a `<Path>` in place of the stripe's `<Rect>`, per spec's
 * "a rect and a stripe" budget — the shape draws a stripe, it is just no
 * longer a rectangle).
 *
 * `taban` is the flat part's height (where it meets the wall); `disPay`
 * is how far each tooth's point drops below that.
 */
export function tenteYolu(
  genislik: number,
  taban: number,
  disPay: number,
  disSayisi: number = TENTE_DIS_SAYISI,
): string {
  const disGenisligi = genislik / disSayisi;
  const parcalar = [`M0,0`, `L${genislik},0`, `L${genislik},${taban}`];
  for (let i = disSayisi - 1; i >= 0; i -= 1) {
    const ortaX = (i + 0.5) * disGenisligi;
    const solX = i * disGenisligi;
    parcalar.push(`L${ortaX},${taban + disPay}`, `L${solX},${taban}`);
  }
  parcalar.push("Z");
  return parcalar.join(" ");
}

// ---------------------------------------------------------------------
// Layout — pure, so the street's geometry is testable without rendering.
// Spec: "26pt-wide storefront", "one <Svg> per month, no per-shop nodes
// beyond a rect and a stripe".
// ---------------------------------------------------------------------

/** Spec-mandated storefront width — the awning spans the full slot, the
 * way a real shop awning is wider than its own window. */
export const DUKKAN_GENISLIK = 26;
/**
 * A visibly wider gap than a chart would ever use between bars — the
 * dark street shows all the way through between two storefronts, which
 * is what makes them read as separate buildings standing apart rather
 * than adjoining segments of one coloured bar (the first render of this
 * screen, at a 3pt gap, read exactly as a bar chart with coloured caps).
 */
export const DUKKAN_ARALIK = 6;
/** The window sits INSET from the awning's own edges — a real shopfront
 * has wall/pillar showing on each side of the glass under a wider
 * awning. Without the inset the window is a flat colour block spanning
 * the whole slot, which is indistinguishable from a bar chart's fill. */
export const DUKKAN_PENCERE_GENISLIK = 18;
const DUKKAN_PENCERE_ICE_PAY = (DUKKAN_GENISLIK - DUKKAN_PENCERE_GENISLIK) / 2;
export function dukkanPencereX(dukkanX: number): number {
  return dukkanX + DUKKAN_PENCERE_ICE_PAY;
}
/** The awning — one shape, coloured by the same hash and the same first
 * colour as the card's tente, so a shop is the same colour everywhere it
 * appears. Not the card's full diagonal `<Pattern>` (at 26×4pt a two-tone
 * diagonal would not read at all) but a scalloped canopy path — see
 * `tenteYolu()`. */
export const TENTE_YUKSEKLIK = 4;
/** The flat part where the awning meets the wall — the teeth (drawn by
 * `tenteYolu`) hang `TENTE_YUKSEKLIK - TENTE_TABAN` below that, dipping
 * slightly over the window's own top edge like a real fabric valance. */
export const TENTE_TABAN = 2;
const TENTE_BOSLUK = 2;
/** The sidewalk line every storefront stands on. */
export const KALDIRIM_KALINLIK = 1;

/** One month's row width — the sum of its storefronts plus the gaps
 * between them, no trailing gap. */
export function ayGenisligi(dukkanSayisi: number): number {
  if (dukkanSayisi <= 0) return 0;
  return dukkanSayisi * DUKKAN_GENISLIK + (dukkanSayisi - 1) * DUKKAN_ARALIK;
}

/**
 * How many unlit, un-rescued frontages continue the street past the most
 * recent rescue — the growing edge you have not lit yet (review: "give the
 * street somewhere to go"). Fixed regardless of how many real storefronts
 * already stand, because the point is that the street keeps going, not how
 * far; it is appended ONLY after the most recent (chronologically last)
 * month, since that is the one growing edge — every earlier month is a
 * settled block of real history, not a place still waiting to be lit.
 */
export const SOKAK_DEVAM_DUKKAN_SAYISI = 3;

/** The closed-frontage placeholder's own height — deliberately BELOW
 * `DUKKAN_TABAN_YUKSEKLIK` (a real single visit's floor), and with no
 * awning at all (see `SeninSokagin.tsx`), so a placeholder cannot be
 * mistaken for a real storefront at a glance or read as an achievement
 * that has not happened. It must not lie: this is a place you have not
 * rescued from. */
export const KAPALI_DUKKAN_YUKSEKLIGI = 14;

/** A month row's total width once the street's continuation is included
 * — used for the last (most recent) month's `<Svg>` only. */
export function ayGenisligiDevamli(
  dukkanSayisi: number,
  devamSayisi: number = SOKAK_DEVAM_DUKKAN_SAYISI,
): number {
  return ayGenisligi(dukkanSayisi + devamSayisi);
}

/** Fixed height for every month's `<Svg>` — tall enough for the tallest
 * possible storefront (a shop rescued four times or more), so no month's
 * row ever reflows the ones next to it. */
export const SOKAK_SVG_YUKSEKLIGI =
  TENTE_YUKSEKLIK +
  TENTE_BOSLUK +
  DUKKAN_TABAN_YUKSEKLIK +
  (DUKKAN_TEKRAR_TAVANI - 1) * DUKKAN_ADIM_YUKSEKLIK +
  KALDIRIM_KALINLIK;

/** The bottom of a storefront body — every storefront's feet, whatever
 * its height, stand on this one line (spec: "it must look like a street,
 * not a bar chart" — a shared baseline is what turns varying heights into
 * a skyline instead of a set of floating bars). */
export const KALDIRIM_Y = SOKAK_SVG_YUKSEKLIGI - KALDIRIM_KALINLIK;

function saatDakikaIstanbul(tarih: Date): { saat: number; dakika: number } {
  const parcalar = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ISTANBUL_TIME_ZONE,
  }).formatToParts(tarih);
  const saat = Number.parseInt(parcalar.find((p) => p.type === "hour")?.value ?? "0", 10);
  const dakika = Number.parseInt(parcalar.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { saat, dakika };
}

/**
 * The average clock time across every rescue — "En sık kurtardığın saat
 * 19:20" (spec §4.7). Pickup windows all sit inside one evening block
 * (never past midnight in practice), so a plain arithmetic mean of
 * minutes-since-midnight is safe: no circular-mean correction needed for
 * this domain, and it degrades gracefully to exactly the single rescue's
 * own time when there is only one — which is what the seeded demo data
 * actually has.
 */
export function enSikSaat(kayitlar: readonly KurtarmaKaydi[]): string | null {
  if (kayitlar.length === 0) return null;
  const toplamDk = kayitlar.reduce((acc, k) => {
    const { saat, dakika } = saatDakikaIstanbul(k.redeemedAt);
    return acc + saat * 60 + dakika;
  }, 0);
  const ortalamaDk = Math.round(toplamDk / kayitlar.length);
  const saat = Math.floor(ortalamaDk / 60) % 24;
  const dakika = ortalamaDk % 60;
  const iki = (n: number) => String(n).padStart(2, "0");
  return `${iki(saat)}:${iki(dakika)}`;
}

export interface EnCokGidilen {
  readonly storeId: string;
  readonly sayac: number;
}

/** The single most-visited shop, ties broken by whichever was rescued
 * most RECENTLY (the street's own tie-break: recency is what the user
 * would remember). */
export function enCokGidilenDukkan(
  kayitlar: readonly KurtarmaKaydi[],
): EnCokGidilen | null {
  if (kayitlar.length === 0) return null;
  const sayaclar = dukkanZiyaretSayilari(kayitlar);
  const sonZiyaret = new Map<string, number>();
  for (const kayit of kayitlar) {
    const mevcut = sonZiyaret.get(kayit.storeId) ?? 0;
    sonZiyaret.set(kayit.storeId, Math.max(mevcut, kayit.redeemedAt.getTime()));
  }
  let en: EnCokGidilen | null = null;
  let enSonZiyaret = -Infinity;
  for (const [storeId, sayac] of sayaclar) {
    const son = sonZiyaret.get(storeId) ?? -Infinity;
    if (
      en === null ||
      sayac > en.sayac ||
      (sayac === en.sayac && son > enSonZiyaret)
    ) {
      en = { storeId, sayac };
      enSonZiyaret = son;
    }
  }
  return en;
}
