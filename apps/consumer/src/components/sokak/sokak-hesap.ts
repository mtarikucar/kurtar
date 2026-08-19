/**
 * SENİN SOKAĞIN — the arithmetic (spec §4.7).
 *
 * Pure, so the street's grouping, the height/brightness of a repeat-visit
 * storefront, the terrace's own silhouette and the two derived stat lines
 * ("en sık kurtardığın saat", "en çok gittiğin dükkân") are unit-testable
 * without rendering anything.
 *
 * What this module deliberately does NOT do: recompute mealsSaved / co2e /
 * moneySaved. Those three are rendered exactly as `GET /me/impact` returns
 * them (task brief: "Impact numbers are rendered as the API returns them,
 * never recomputed on the client"). Everything here is a different kind of
 * number — a shape derived from the caller's own reservation history, which
 * has no backend endpoint of its own.
 */
import { kis } from "../kepenk/olcum";
import { tenteHash } from "../kepenk/tente-desen";

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

// ---------------------------------------------------------------------
// The building. A shop on this street is a TERRACE HOUSE: a fixed
// ground-floor shopfront (awning, window, door — always the same size,
// because a real parade of shops all opens onto the same pavement) under
// a wall whose PARAPET is what carries the repeat-visit reward.
//
// That split is the whole fix for the bar-chart read: when the entire
// shape scaled with the count, the drawing WAS a bar. Now the thing that
// varies is the roofline — which is what varies down any real street —
// and the shopfront, the part the eye actually reads, is constant.
// ---------------------------------------------------------------------

/** Parapet height of a one-time visit's building, measured from the
 * pavement. Four units of wall stand above the awning: enough that the
 * shopfront reads as being IN a building rather than being the building. */
export const DUKKAN_TABAN_YUKSEKLIK = 24;
/** Per repeat visit, capped — see DUKKAN_TEKRAR_TAVANI. One storey. */
const DUKKAN_ADIM_YUKSEKLIK = 5;
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

/** How many storeys of flats stand above a shop — the same repeat count
 * the parapet encodes, drawn a second time as lit upper windows so a
 * regular's building is INHABITED, not merely tall. */
export function dukkanKatSayisi(sayac: number): number {
  return kis(sayac - 1, 0, DUKKAN_TEKRAR_TAVANI - 1);
}

/**
 * Roofline jitter, 0..CATI_OYNAMA_TAVANI units, hashed off the shop id.
 *
 * Without it a month of one-time rescues is the same building stamped
 * six times, which is the other half of what made this read as a chart.
 * Deliberately smaller than one repeat-visit storey, so it decorates the
 * skyline without ever blurring "this is the shop you keep going back
 * to". Shifted off the awning hash so a shop's colour and its roofline
 * are not the same fact told twice.
 */
export const CATI_OYNAMA_TAVANI = 2;
export function catPayi(dukkanId: string): number {
  return (tenteHash(dukkanId) >>> 5) % (CATI_OYNAMA_TAVANI + 1);
}

/** One shop's actual parapet: the visit reward plus its own roofline. */
export function dukkanCatiYuksekligi(dukkanId: string, sayac: number): number {
  return dukkanYuksekligi(sayac) + catPayi(dukkanId);
}

/**
 * A single visit's window is already LIT — this is the floor of the lerp,
 * not its darkest imaginable end.
 *
 * The first rescue is the state a user spends by far the longest looking
 * at, and at the old 0.3 floor it resolved to a muddy brown: the one
 * frame that has to say "this one is yours" said "unfinished". The floor
 * is now high enough that a single storefront reads as sodium-lit at a
 * glance; the repeat-visit range rides on top of it and is carried as
 * much by the extra storeys and the extra height as by the last third of
 * the brightness scale.
 */
export const DUKKAN_TABAN_PARLAKLIK = 0.74;

/** Brighter for a shop rescued more than once — 0..1, how hard the shop
 * burns. A single visit is unmistakably lit; a regular's window is the
 * brightest thing on the row. */
export function dukkanParlakligi(sayac: number): number {
  const tekrar = kis(sayac - 1, 0, DUKKAN_TEKRAR_TAVANI - 1);
  const oran = tekrar / (DUKKAN_TEKRAR_TAVANI - 1);
  return DUKKAN_TABAN_PARLAKLIK + oran * (1 - DUKKAN_TABAN_PARLAKLIK);
}

/** The flat above the shop is lit softer than the shop itself — the lamp
 * that matters is the one behind the glass at street level. */
export const UST_KAT_PARLAKLIK_ORANI = 0.55;
/**
 * The door is dark painted timber, not a second window — a fixed dim
 * value rather than a fraction of the visit count, because a door is a
 * door however often you go there. Its lit fanlight does the talking, and
 * the contrast between one big amber window and one dark door beside it
 * is what gives the shopfront a structure instead of a coloured band.
 */
export const KAPI_PARLAKLIK = 0.18;

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
 * its bottom edge. Six across a 24-unit canopy, which at the street's own
 * scale is the same stripe pitch the card's tente reads at. */
export const TENTE_DIS_SAYISI = 6;

/**
 * The awning as a fabric canopy, not a plain rectangle: a scalloped
 * (pinked) bottom edge — the standard shorthand for a shop awning in
 * every icon set that draws one, and it shares nothing with chart
 * iconography, which never puts a zigzag on a bar's cap.
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

/**
 * The awning's SECOND colour — every other scallop, drawn as one path of
 * disjoint closed subpaths over the canopy above.
 *
 * A real tente is striped, and the pair is the shop's identity (spec §3:
 * "Moda Fırın is always the red-and-white one"). Drawing it as a second
 * path rather than a `<Pattern>` costs one node instead of a `<Defs>`
 * entry per shop, and unlike the card's 45° pattern it lands exactly on
 * the scallops, which is where a fabric awning's stripes actually are.
 */
export function tenteSeritYolu(
  genislik: number,
  taban: number,
  disPay: number,
  disSayisi: number = TENTE_DIS_SAYISI,
  parite: 0 | 1 = 1,
): string {
  const disGenisligi = genislik / disSayisi;
  const parcalar: string[] = [];
  for (let i = parite; i < disSayisi; i += 2) {
    const solX = i * disGenisligi;
    const sagX = (i + 1) * disGenisligi;
    const ortaX = (i + 0.5) * disGenisligi;
    parcalar.push(
      `M${solX},0`,
      `L${sagX},0`,
      `L${sagX},${taban}`,
      `L${ortaX},${taban + disPay}`,
      `L${solX},${taban}`,
      "Z",
    );
  }
  return parcalar.join(" ");
}

// ---------------------------------------------------------------------
// Layout — pure, so the street's geometry is testable without rendering.
//
// Everything below is measured in the drawing's OWN units, with vertical
// distances counted UP from the pavement's top edge; the renderer flips
// them once (`tabanY - deger`) and shows the whole thing scaled through a
// viewBox. Spec: "26pt-wide storefront", "one <Svg> per month".
// ---------------------------------------------------------------------

/** Spec-mandated storefront width. */
export const DUKKAN_GENISLIK = 26;

/**
 * Shops ADJOIN. There is no gap.
 *
 * The previous pass put 6 units of dark street between every storefront,
 * on the theory that a visible gap is what stops a row of blocks reading
 * as a bar chart. It does the opposite: detached blocks standing on a
 * baseline are exactly what a bar chart is, and a street is the one
 * arrangement of buildings that never has gaps — a Kadıköy parade is a
 * terrace sharing party walls, and the party wall is drawn (see
 * `partiDuvariYolu`) rather than left as a hole.
 */
export const DUKKAN_ARALIK = 0;

/** The pavement the whole terrace stands on: a slab plus the kerb edge
 * where it drops to the road. Continuous under every frontage, rescued or
 * not — it is one street. */
export const KALDIRIM_KALINLIK = 3;
export const KERB_KALINLIK = 1;
export const KALDIRIM_YUKSEKLIK = KALDIRIM_KALINLIK + KERB_KALINLIK;

/** The wall each side of the shopfront opening — the pier a real parade
 * of shops is divided by. */
export const CEPHE_PAY = 2;
/** The shopfront opening: dark painted frame, from the pavement up. */
export const VITRIN_YUKSEKLIK = 16;
export const VITRIN_GENISLIK = DUKKAN_GENISLIK - 2 * CEPHE_PAY;

/** The glass. Inset one unit inside the frame on every side it touches. */
export const PENCERE_X = 3;
export const PENCERE_GENISLIK = 13;
export const PENCERE_ESIK = 4;
export const PENCERE_YUKSEKLIK = 11;
/** The lit band at the top of the glass — the lamp itself, at full
 * strength for every rescued shop, so even the dimmest single visit has
 * one element on it brighter than any surface around it (exactly what
 * the card's `isikCekirdek` core does inside the vitrin). */
export const LAMBA_YUKSEKLIK = 2.5;
/** One vertical glazing bar. A single sheet of colour is a fill; a sheet
 * with a bar across it is glass. */
export const KAYIT_GENISLIK = 0.8;

/** The door, floor to head, beside the window with a pier between. */
export const KAPI_X = 17;
export const KAPI_GENISLIK = 6;
export const KAPI_YUKSEKLIK = 15;
/** The lit fanlight over the door. */
export const KAPI_TEPE_YUKSEKLIK = 2;

/** The awning overhangs the opening on both sides, the way one does. */
export const TENTE_X = 1;
export const TENTE_GENISLIK = DUKKAN_GENISLIK - 2 * TENTE_X;
/** The flat part where the awning meets the wall; the teeth hang
 * `TENTE_YUKSEKLIK - TENTE_TABAN` below it, dipping over the window head
 * like a real fabric valance. */
export const TENTE_TABAN = 3;
export const TENTE_YUKSEKLIK = 4.6;
/** Top of the awning = top of the ground floor. Every shopfront on the
 * street has exactly this one, so the parade opens onto one pavement at
 * one height and only the roofline above it varies. */
export const ZEMIN_KAT_YUKSEKLIK = 20;

/** Upper-storey windows: a row per repeat visit, hung down from the
 * parapet so the top floor always sits under the roof rather than
 * floating. */
export const UST_PENCERE_GENISLIK = 6;
export const UST_PENCERE_YUKSEKLIK = 3.5;
const UST_PENCERE_ADIM = 5.5;
const UST_PENCERE_SACAK = 2.5;
const UST_PENCERE_X = [4, DUKKAN_GENISLIK - 4 - UST_PENCERE_GENISLIK] as const;

export interface UstPencere {
  /** Offset from the building's own left edge. */
  readonly x: number;
  /** Height of the window's BOTTOM above the pavement. */
  readonly taban: number;
}

/**
 * Where the flats' windows go for a building of this parapet height and
 * this many storeys — pure, so "a lit window never crosses the awning and
 * never pokes through the roof" is a unit test rather than a squint.
 */
export function ustPencereler(cati: number, katSayisi: number): UstPencere[] {
  const pencereler: UstPencere[] = [];
  for (let kat = 0; kat < katSayisi; kat += 1) {
    const taban = cati - UST_PENCERE_SACAK - UST_PENCERE_YUKSEKLIK - kat * UST_PENCERE_ADIM;
    if (taban < ZEMIN_KAT_YUKSEKLIK) break;
    for (const x of UST_PENCERE_X) pencereler.push({ x, taban });
  }
  return pencereler;
}

/** One month's row width — a terrace, so the sum of its frontages with
 * no gaps and no trailing space. */
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

/** The closed frontage's own parapet — deliberately BELOW
 * `DUKKAN_TABAN_YUKSEKLIK` (a real single visit's floor), and UNIFORM
 * across all of them, with no awning, no light and the shutter all the
 * way down. Two shops you rescued are two buildings; the street ahead is
 * one unbroken shuttered stretch, and it must never be mistakable for an
 * achievement that has not happened. */
export const KAPALI_DUKKAN_YUKSEKLIGI = 21;
/** The shutter box over a closed opening — the lintel the kepenk rolls
 * out of, the same 'shutter at 0.08 reads as the box' shape the card's
 * gauge bottoms out at (spec §2). */
export const KEPENK_LENTO_YUKSEKLIK = 2.5;
/** Shutter corrugation: one `<Pattern>` per month's `<Svg>`, shared by
 * every closed frontage in it — never one `<Rect>` per slat (spec §5.3).
 * Four units per rib pair is the card's own 8pt pitch carried across at
 * this drawing's scale. */
export const OLUK_ADIM = 4;
/** The bottom lip the eye tracks, and the specular line above it. */
export const KEPENK_DUDAK = 1;

/** A month row's total width once the street's continuation is included
 * — used for the last (most recent) month's `<Svg>` only. */
export function ayGenisligiDevamli(
  dukkanSayisi: number,
  devamSayisi: number = SOKAK_DEVAM_DUKKAN_SAYISI,
): number {
  return ayGenisligi(dukkanSayisi + devamSayisi);
}

/** The tallest parapet the street could ever draw — a shop rescued at or
 * past the cap that also drew the highest roofline. Nothing reserves this
 * much room; it is the ceiling the drawing is proved to stay under. */
export const SOKAK_EN_YUKSEK_CATI =
  DUKKAN_TABAN_YUKSEKLIK +
  (DUKKAN_TEKRAR_TAVANI - 1) * DUKKAN_ADIM_YUKSEKLIK +
  CATI_OYNAMA_TAVANI;

/** …and the `<Svg>` height that would need. */
export const SOKAK_SVG_YUKSEKLIGI = SOKAK_EN_YUKSEK_CATI + KALDIRIM_YUKSEKLIK;

/**
 * The tallest parapet this PARTICULAR street actually has.
 *
 * The street used to reserve `SOKAK_SVG_YUKSEKLIGI` — room for a
 * four-times regular — on every profile, which for the user who has
 * rescued once meant a strip of empty sky nearly as tall as the drawing,
 * on the one screen whose vertical budget is contested. One height for
 * the whole street (not per month) still means no month's row reflows the
 * ones beside it, and the month labels stay on one line.
 */
export function sokakCatiTavani(
  kayitlar: readonly KurtarmaKaydi[],
  ziyaretSayilari: Map<string, number>,
): number {
  let en = KAPALI_DUKKAN_YUKSEKLIGI;
  for (const kayit of kayitlar) {
    const sayac = ziyaretSayilari.get(kayit.storeId) ?? 1;
    en = Math.max(en, dukkanCatiYuksekligi(kayit.storeId, sayac));
  }
  return en;
}

/** …and the `<Svg>` height that street needs, pavement included. */
export function sokakYuksekligi(catiTavani: number): number {
  return catiTavani + KALDIRIM_YUKSEKLIK;
}

/**
 * The terrace as ONE closed path: every façade, adjoining, stepping at
 * the party wall from one parapet to the next.
 *
 * One node for the whole block rather than a `<Rect>` per building. That
 * is not only the spec's node budget (§5.3, "one is a draw call, the
 * other is 300 nodes"): a single path means there is no seam, no
 * half-pixel gap and no antialiased edge between two neighbours, which is
 * precisely the artefact that would put the islands back.
 */
export function terasYolu(catilar: readonly number[], tabanY: number): string {
  if (catilar.length === 0) return "";
  const parcalar: string[] = [`M0,${tabanY}`];
  catilar.forEach((cati, i) => {
    const x = i * DUKKAN_GENISLIK;
    parcalar.push(`L${x},${tabanY - cati}`, `L${x + DUKKAN_GENISLIK},${tabanY - cati}`);
  });
  parcalar.push(`L${catilar.length * DUKKAN_GENISLIK},${tabanY}`, "Z");
  return parcalar.join(" ");
}

/** The lit top edge of every façade — one stroked path with a subpath per
 * building, so the roofline reads as a cornice catching light rather than
 * as the boundary of a filled shape. */
export function korniyYolu(catilar: readonly number[], tabanY: number): string {
  return catilar
    .map((cati, i) => {
      const x = i * DUKKAN_GENISLIK;
      const y = tabanY - cati;
      return `M${x},${y} L${x + DUKKAN_GENISLIK},${y}`;
    })
    .join(" ");
}

/** The party walls — the vertical joints between neighbours, each rising
 * only to the LOWER of the two parapets it divides, because above that
 * point there is only one building. Also one stroked path. */
export function partiDuvariYolu(catilar: readonly number[], tabanY: number): string {
  const parcalar: string[] = [];
  for (let i = 1; i < catilar.length; i += 1) {
    const x = i * DUKKAN_GENISLIK;
    const tepe = Math.min(catilar[i - 1]!, catilar[i]!);
    parcalar.push(`M${x},${tabanY} L${x},${tabanY - tepe}`);
  }
  return parcalar.join(" ");
}

/**
 * The pool of light a lit shop throws across the pavement in front of
 * itself — a trapezoid splaying from the shopfront opening out to the
 * building's full width at the kerb.
 *
 * This is the one element that says the light is coming OUT of the shop
 * rather than being painted on it, and at a single rescue it is half of
 * what makes the frontage read as inhabited. Adjacent lit shops' pools
 * meet at the party wall, so a rescued stretch lights a continuous strip
 * of pavement — which is what a lit parade actually looks like.
 */
export function isikHavuzuYolu(x: number, tabanY: number): string {
  const solUst = x + CEPHE_PAY;
  const sagUst = x + DUKKAN_GENISLIK - CEPHE_PAY;
  const alt = tabanY + KALDIRIM_KALINLIK;
  return `M${solUst},${tabanY} L${sagUst},${tabanY} L${x + DUKKAN_GENISLIK},${alt} L${x},${alt} Z`;
}

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
