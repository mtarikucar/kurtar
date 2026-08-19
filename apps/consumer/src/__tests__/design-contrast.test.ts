import { kontrastOrani } from "../design/kontrast";
import { isikAltindaZemin, toplamAlfa } from "../components/teslim/dukkan-isigi";
import { PALETLER, yazi, type Faz, type Palet } from "../design/tokens";
import { anaYazi, sisYazi, sodyumYazisi } from "../design/zemin";

/**
 * Contrast, as an inventory of what the app ACTUALLY paints (spec §6,
 * Phase 0).
 *
 * The first version of this file asserted the pairs someone remembered,
 * which is how `alacakaranlik` shipped with secondary type at 1.93:1 on
 * its own street: nobody had written down that `yaziSis` was ever set on
 * `bgAsfalt`, so nothing measured it. This version is a table of every
 * (ink, ground) pair that exists in the render tree, each row naming the
 * files that produce it and the type token it is set in — so a pair can
 * only escape measurement by escaping the table, and the table is the
 * thing a reviewer reads.
 *
 * Sizes are taken from `yazi` rather than typed in, so "this is legal at
 * 3:1 because the text is large" is a claim the compiler and the test
 * check together (`buyukMu`), never a claim in a comment.
 */

const FAZLAR: readonly Faz[] = ["gece", "alacakaranlik", "gunduz"];

/** WCAG AA for body text. */
const YAZI_TABANI = 4.5;
/** WCAG AA for large text and for non-text objects (icons, bars, thumbs). */
const IRI_TABANI = 3;

/**
 * WCAG "large text": ≥24px, or ≥18.66px bold. Every size in this app is
 * pt and renders 1:1 in the web export, so the number in `yazi` IS the
 * px. Archivo Black is a single ultra weight, so anything set in it
 * counts as bold at 18.66.
 */
function buyukMu(token: keyof typeof yazi): boolean {
  const t = yazi[token];
  const kalin =
    t.fontFamily.startsWith("ArchivoBlack") ||
    t.fontFamily.endsWith("700Bold") ||
    t.fontFamily.endsWith("600SemiBold");
  return t.fontSize >= 24 || (kalin && t.fontSize >= 18.66);
}

type Secici = (p: Palet) => string;

interface Kullanim {
  /** What this is, in the app. */
  readonly ad: string;
  readonly murekkep: Secici;
  readonly zemin: Secici;
  /**
   * The type tokens this pair is actually set in. Every one of them must
   * be small (i.e. hold the 4.5 floor) unless `grafik` says the pair is
   * not type at all. `[]` means "not type" — an icon stroke, a bar, a
   * thumb — and those take the 3:1 object floor.
   */
  readonly boyutlar: readonly (keyof typeof yazi)[];
  /** Where it is painted. Relative to `src/`. */
  readonly yerler: readonly string[];
}

/** The floor a usage has to clear: 4.5 unless every size on it is large. */
function taban(k: Kullanim): number {
  if (k.boyutlar.length === 0) return IRI_TABANI;
  return k.boyutlar.every(buyukMu) ? IRI_TABANI : YAZI_TABANI;
}

/* ------------------------------------------------------------------ *
 * 1. THE CARD / PANEL SURFACES — `yaziAna` / `yaziSis` / `sodyumYazi`
 * ------------------------------------------------------------------ */

const KART: readonly Kullanim[] = [
  {
    ad: "primary type on the storefront card",
    murekkep: (p) => p.yaziAna,
    zemin: (p) => p.yuzeyKaldirim,
    boyutlar: ["paket", "title", "body", "dataLg", "priceXl"],
    yerler: [
      "components/kepenk/VitrinKarti.tsx (paket adı)",
      "components/OrderRow.tsx, components/ComplaintRow.tsx",
      "components/teslim/AlisPenceresi.tsx (pencere uçları)",
      "app/order/[id].tsx (bilet), app/purchase/[offerId].tsx (adet, Blok içi)",
      "app/complaints/[id].tsx (satıcı balonu), app/offer/[id].tsx (alerjen, Blok içi)",
      "app/(tabs)/profile.tsx (MenuRow), app/notification-preferences.tsx (SaatButonu)",
      "app/redeem/[id].tsx (çevrimdışı bildirimi — kendi yüzeyini boyar)",
      "components/panel/PanelTextArea.tsx (girilen metin)",
    ],
  },
  {
    ad: "secondary type on the storefront card",
    murekkep: (p) => p.yaziSis,
    zemin: (p) => p.yuzeyKaldirim,
    boyutlar: ["data", "body", "label", "micro"],
    yerler: [
      "components/kepenk/VitrinKarti.tsx (değer bandı, meta rayı)",
      "components/kepenk/StokCipi.tsx (saydam çip, kartın üstünde)",
      "components/OrderRow.tsx, components/ComplaintRow.tsx",
      "components/teslim/AlisPenceresi.tsx, components/teslim/DetayBasligi.tsx",
      "app/order/[id].tsx, app/purchase/[offerId].tsx (Blok içi)",
      "app/complaints/[id].tsx (satıcı balonu), app/(tabs)/profile.tsx (MenuRow ikonları)",
      "components/panel/PanelTextArea.tsx (placeholder)",
    ],
  },
  {
    ad: "sodium as type on the card",
    murekkep: (p) => p.sodyumYazi,
    zemin: (p) => p.yuzeyKaldirim,
    boyutlar: ["priceLg", "micro", "dataLg", "bodyStrong", "data"],
    yerler: [
      "components/kepenk/VitrinKarti.tsx (fiyat, ×kat)",
      "components/kepenk/DegerCubugu.tsx (etiket, varsayılan zemin)",
      "components/teslim/DetayBasligi.tsx (puan)",
      "app/order/[id].tsx (toplam, bilet özeti)",
      "app/purchase/[offerId].tsx (toplam, ön bilgilendirme bağlantıları)",
    ],
  },
  {
    ad: "primary type on a raised panel (sheet / sticky bar / tab bar)",
    murekkep: (p) => p.yaziAna,
    zemin: (p) => p.yuzeyYukselti,
    boyutlar: ["bodyStrong"],
    yerler: ["components/kesif/HaritaSatiri.tsx (dükkân adı, harita alt sayfası)"],
  },
  {
    ad: "secondary type on a raised panel",
    murekkep: (p) => p.yaziSis,
    zemin: (p) => p.yuzeyYukselti,
    boyutlar: ["label", "body", "data"],
    yerler: [
      "app/(tabs)/harita.tsx (alt sayfa başlığı, boş durum)",
      "components/teslim/ortak.tsx (Dugme altEtiketi, YapiskanCubuk içinde)",
    ],
  },
  {
    ad: "sodium as type on a raised panel",
    murekkep: (p) => p.sodyumYazi,
    zemin: (p) => p.yuzeyYukselti,
    boyutlar: ["priceLg"],
    yerler: ["components/kesif/HaritaSatiri.tsx (fiyat)"],
  },
];

/* ------------------------------------------------------------------ *
 * 2. THE STREET GROUND — `yaziAnaZemin` / `yaziSisZemin` / `sodyumYaziZemin`
 * ------------------------------------------------------------------ */

const SOKAK: readonly Kullanim[] = [
  {
    ad: "primary type on the street",
    murekkep: (p) => p.yaziAnaZemin,
    zemin: (p) => p.bgAsfalt,
    boyutlar: ["title", "tabelaXl", "tabelaLg", "body", "paket", "label", "dataLg", "bodyStrong"],
    yerler: [
      "components/panel/PanelHeader.tsx (her yığın ekranın başlığı)",
      "components/panel/PanelEmptyState.tsx, PanelErrorState.tsx (başlık)",
      "components/kesif/Baslik.tsx (bölge adı), components/kesif/BosSokak.tsx (başlık + CTA)",
      "components/teslim/DurumEkrani.tsx (başlık), components/teslim/KapandiEkrani.tsx (başlık)",
      "components/teslim/ortak.tsx (ikincil Dugme etiketi, zemin=\"sokak\")",
      "app/(tabs)/orders.tsx, app/(tabs)/profile.tsx (ekran başlığı, SOKAK etiketi)",
      "app/offer/[id].tsx (paket adı, adres), app/purchase/[offerId].tsx (başlık, tabela)",
      "app/payment/[id].tsx, app/order/[id].tsx, app/complaints/[id].tsx",
      "app/complaint/new.tsx, app/report/new.tsx, app/legal/[doc].tsx",
      "app/notification-preferences.tsx, app/sokak-inceleme.tsx, app/vitrin.tsx",
    ],
  },
  {
    ad: "secondary type on the street",
    murekkep: (p) => p.yaziSisZemin,
    zemin: (p) => p.bgAsfalt,
    boyutlar: ["data", "body", "label", "micro"],
    yerler: [
      "components/kesif/Baslik.tsx (saat), BolumBasligi.tsx (semt kuralı)",
      "components/kesif/SokakSatiri.tsx (mesafe omurgası), SokakYukleniyor.tsx",
      "components/kesif/CiplerBar.tsx (seçili olmayan çip), BosSokak.tsx (gövde)",
      "components/panel/PanelChip.tsx, PanelLoadingState.tsx, PanelTextArea.tsx (etiket)",
      "components/panel/PanelEmptyState.tsx, PanelErrorState.tsx (gövde)",
      "components/teslim/ortak.tsx (BolumBasligi, Dugme altEtiketi zemin=\"sokak\")",
      "components/teslim/DurumEkrani.tsx, KapandiEkrani.tsx (açıklama)",
      "components/sokak/SeninSokagin.tsx (ay etiketi, boş sokak)",
      "components/MapPane.native.tsx (harita etiketleri — halesi bgAsfalt)",
      "app/(tabs)/index.tsx (konum bandı, açık sayısı), app/(tabs)/orders.tsx (bölüm)",
      "app/(tabs)/profile.tsx, app/offer/[id].tsx, app/purchase/[offerId].tsx",
      "app/payment/[id].tsx, app/order/[id].tsx (ilçe), app/complaints/[id].tsx",
      "app/complaint/new.tsx, app/legal/[doc].tsx, app/notification-preferences.tsx",
      "app/sokak-inceleme.tsx, app/vitrin.tsx",
    ],
  },
  {
    ad: "sodium as type on the street",
    murekkep: (p) => p.sodyumYaziZemin,
    zemin: (p) => p.bgAsfalt,
    boyutlar: ["priceXl", "dataLg", "data", "micro", "label"],
    yerler: [
      "app/offer/[id].tsx (fiyat, ×kat)",
      "app/(tabs)/profile.tsx (etki sayıları, en sık saat, en çok gidilen)",
      "app/(tabs)/index.tsx (konum aç), components/kesif/BosSokak.tsx (geri sayım)",
      "app/notification-preferences.tsx (kaydedildi)",
      "components/kepenk/DegerCubugu.tsx (etiket, zemin=\"sokak\" — /vitrin şeridi)",
    ],
  },
  {
    ad: "an icon stroke on the street",
    murekkep: (p) => p.yaziAnaZemin,
    zemin: (p) => p.bgAsfalt,
    boyutlar: [],
    yerler: [
      "components/panel/PanelHeader.tsx (geri/kapat), components/teslim/ortak.tsx (IkonDugmesi)",
    ],
  },
  {
    ad: "a secondary icon on the street",
    murekkep: (p) => p.yaziSisZemin,
    zemin: (p) => p.bgAsfalt,
    boyutlar: [],
    yerler: [
      "components/kesif/Baslik.tsx (chevron), components/panel/PanelEmptyState.tsx (36pt ikon)",
      "components/panel/PanelErrorState.tsx (36pt ikon), app/(tabs)/profile.tsx",
    ],
  },
  {
    ad: "the switch thumb against its own track",
    murekkep: (p) => p.yaziAnaZemin,
    zemin: (p) => p.cizgiKil,
    boyutlar: [],
    yerler: ["components/panel/PanelToggle.tsx (kapalı konum)"],
  },
];

/* ------------------------------------------------------------------ *
 * 3. THE RECESS — `yaziAnaCukur` / `yaziSisCukur` / `sodyumYaziCukur`
 * ------------------------------------------------------------------ */

const CUKUR: readonly Kullanim[] = [
  {
    ad: "primary type on the recess",
    murekkep: (p) => p.yaziAnaCukur,
    zemin: (p) => p.bgDerin,
    boyutlar: ["bodyStrong", "label", "data", "body", "dataLg", "clock", "code"],
    yerler: [
      "components/MapPane.web.tsx (harita yok başlığı, listeye dön)",
      "components/MapPane.native.tsx (fiyat pini — §4.2 'data 12 ivory')",
      "components/teslim/CanliSaat.tsx (saat), components/teslim/Kod.tsx (haneler)",
      "components/teslim/OnayEkrani.tsx (fiş satırları)",
      "app/redeem/[id].tsx (paket, teslim saati)",
    ],
  },
  {
    ad: "secondary type on the recess",
    murekkep: (p) => p.yaziSisCukur,
    zemin: (p) => p.bgDerin,
    boyutlar: ["body", "data", "label"],
    yerler: [
      "components/MapPane.web.tsx (gövde)",
      "components/teslim/Kod.tsx (KURTAR etiketi), OnayEkrani.tsx (çanta satırı)",
      "app/redeem/[id].tsx (ilçe, tarih, kapanış sayacı, yanlışlıkla açtım)",
    ],
  },
  {
    ad: "sodium as type on the recess",
    murekkep: (p) => p.sodyumYaziCukur,
    zemin: (p) => p.bgDerin,
    boyutlar: ["dataLg"],
    yerler: [
      "app/redeem/[id].tsx (ödendi, etki satırı)",
      "components/teslim/OnayEkrani.tsx (ödendi)",
    ],
  },
  {
    ad: "an icon stroke on the recess",
    murekkep: (p) => p.yaziAnaCukur,
    zemin: (p) => p.bgDerin,
    boyutlar: [],
    yerler: [
      "components/teslim/ortak.tsx (IkonDugmesi zemin=\"cukur\" — redeem geri)",
      "components/MapPane.web.tsx (28pt harita ikonu)",
      "components/teslim/CanliSaat.tsx (nabız çubuğu)",
    ],
  },
];

/* ------------------------------------------------------------------ *
 * 4. PAINTED OBJECTS — an ink declared next to the one fill it may sit on
 * ------------------------------------------------------------------ */

const NESNELER: readonly Kullanim[] = [
  {
    ad: "data type in the time pill / on the redeem handle",
    murekkep: (p) => p.hapYazi,
    zemin: (p) => p.hapZemin,
    boyutlar: ["data", "sticker"],
    yerler: [
      "components/kepenk/ZamanHapi.tsx, components/kesif/HaritaSatiri.tsx (süre hapı)",
      "components/teslim/KepenkKolu.tsx (kol etiketi ve okları)",
    ],
  },
  {
    ad: "the sub-label on the redeem handle",
    murekkep: (p) => p.hapYaziSis,
    zemin: (p) => p.hapZemin,
    boyutlar: ["data"],
    yerler: ["components/teslim/KepenkKolu.tsx (alt etiket)"],
  },
  {
    ad: "the shop name on its plaque",
    murekkep: (p) => p.plakaYazi,
    zemin: (p) => p.plakaZemin,
    boyutlar: ["tabelaXl", "tabelaLg", "data"],
    yerler: [
      "components/kepenk/Tabela.tsx, components/teslim/DetayBasligi.tsx, HeroTabela.tsx",
      "components/kesif/HataSokagi.tsx (kepenge yapıştırılmış not)",
    ],
  },
  {
    ad: "ink on a sodium fill",
    murekkep: (p) => p.sodyumMurekkep,
    zemin: (p) => p.sodyumDolgu,
    boyutlar: ["sticker", "body", "data", "dataLg", "label"],
    yerler: [
      "components/teslim/ortak.tsx (Dugme), components/panel/PanelButton.tsx",
      "components/panel/PanelMuhur.tsx (KURTARILDI), components/kesif/CiplerBar.tsx (seçili çip)",
      "components/OrderRow.tsx (KEPENGİ AÇ), app/complaints/[id].tsx (kendi mesajın)",
    ],
  },
  {
    ad: "ink on an awning-red fill",
    murekkep: (p) => p.tenteMurekkep,
    zemin: (p) => p.tenteDolgu,
    boyutlar: ["sticker", "cipAlarm", "data", "bodyStrong", "body"],
    yerler: [
      "components/kepenk/VitrinKarti.tsx (TÜKENDİ), ZamanHapi.tsx / StokCipi.tsx (alarm)",
      "app/redeem/[id].tsx (uyarı çipi, hata), components/panel/PanelPill.tsx (tente tonu)",
    ],
  },
  {
    ad: "awning red as type, on the one surface this phase allows it",
    murekkep: (p) => p.tenteYazi,
    zemin: (p) => p.tenteYaziZemini,
    boyutlar: ["data"],
    yerler: ["§1.1'in kuralı: kırmızı kartın üstünde asla yazı değildir"],
  },
];

const TUMU: readonly Kullanim[] = [...KART, ...SOKAK, ...CUKUR, ...NESNELER];

describe.each(FAZLAR)("%s — every ink the app sets, on the ground it sets it on", (ad) => {
  const p = PALETLER[ad];

  it.each(TUMU.map((k) => [k.ad, k] as const))("%s", (_ad, k) => {
    const olculen = kontrastOrani(k.murekkep(p), k.zemin(p));
    // The floor is derived from the type tokens the pair is actually set
    // in, so a 3:1 row has to PROVE its size rather than assert it.
    expect({ oran: Number(olculen.toFixed(2)), yerler: k.yerler.length > 0 }).toEqual({
      oran: Number(olculen.toFixed(2)),
      yerler: true,
    });
    expect(olculen).toBeGreaterThanOrEqual(taban(k));
  });
});

describe("nothing in the table leans on the large-text exemption", () => {
  /**
   * Four rows in the table are not type at all — an icon stroke, a
   * 36pt glyph, the pulse bar, the switch thumb — and those take the 3:1
   * object floor. One row IS type and happens to be large enough to be
   * allowed 3:1 (the 26pt price in the map sheet). It does not need the
   * allowance, and neither does anything else: EVERY row that carries
   * words clears 4.5:1 in all three phases, including the 56pt clock and
   * the 44pt code. If a future change makes a word depend on its own size
   * to pass, this fails and the change has to argue for itself.
   */
  const NESNE_SATIRLARI = TUMU.filter((k) => k.boyutlar.length === 0);
  const YAZI_SATIRLARI = TUMU.filter((k) => k.boyutlar.length > 0);

  it("takes the 3:1 object floor for exactly the four non-text rows", () => {
    expect(NESNE_SATIRLARI.map((k) => k.ad)).toEqual([
      "an icon stroke on the street",
      "a secondary icon on the street",
      "the switch thumb against its own track",
      "an icon stroke on the recess",
    ]);
  });

  it("names the one text row that WOULD be allowed 3:1", () => {
    expect(YAZI_SATIRLARI.filter((k) => taban(k) === IRI_TABANI).map((k) => k.ad)).toEqual([
      // components/kesif/HaritaSatiri.tsx, `yazi.priceLg` = 26pt.
      "sodium as type on a raised panel",
    ]);
  });

  it.each(FAZLAR)("%s — every text row clears 4.5:1 anyway", (ad) => {
    const p = PALETLER[ad];
    const zayif = YAZI_SATIRLARI.filter(
      (k) => kontrastOrani(k.murekkep(p), k.zemin(p)) < YAZI_TABANI,
    ).map((k) => k.ad);
    expect(zayif).toEqual([]);
  });

  it("knows what large text is", () => {
    expect(buyukMu("clock")).toBe(true); // 56
    expect(buyukMu("code")).toBe(true); // 44
    expect(buyukMu("priceXl")).toBe(true); // 40
    expect(buyukMu("tabelaLg")).toBe(true); // 20, Archivo Black
    expect(buyukMu("body")).toBe(false); // 15 regular
    expect(buyukMu("bodyStrong")).toBe(false); // 15 semibold — under 18.66
    expect(buyukMu("dataLg")).toBe(false); // 15 bold — under 18.66
    expect(buyukMu("data")).toBe(false); // 12
  });

  it("names a call site for every row", () => {
    for (const k of TUMU) expect(k.yerler.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 5. THE LIT INTERIOR — redeem / confirmation, where the recess is
 *    composited with the shop's own lamp before any type lands on it.
 * ------------------------------------------------------------------ */

/** Depths type actually lands at on those two screens (see
 * teslim-acik-dukkan.test.ts, which owns the light itself). */
const YAZI_DERINLIKLERI = [0.04, 0.08, 0.14, 0.25, 0.45, 0.7, 0.86, 0.98];
const ACIKLIK = 844;

describe.each(FAZLAR)("%s — the recess family survives the shop's own lamp", (ad) => {
  const p = PALETLER[ad];

  it.each(YAZI_DERINLIKLERI)("primary at depth %s", (oran) => {
    const zemin = isikAltindaZemin(p, toplamAlfa(oran, ACIKLIK));
    expect(kontrastOrani(p.yaziAnaCukur, zemin)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it.each(YAZI_DERINLIKLERI)("secondary at depth %s", (oran) => {
    const zemin = isikAltindaZemin(p, toplamAlfa(oran, ACIKLIK));
    expect(kontrastOrani(p.yaziSisCukur, zemin)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it.each(YAZI_DERINLIKLERI)("money at depth %s", (oran) => {
    const zemin = isikAltindaZemin(p, toplamAlfa(oran, ACIKLIK));
    expect(kontrastOrani(p.sodyumYaziCukur, zemin)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });
});

/* ------------------------------------------------------------------ *
 * 6. WHY THE TWILIGHT VALUES ARE WHAT THEY ARE
 * ------------------------------------------------------------------ */

describe("the twilight street has a ceiling, not just a floor", () => {
  const ara = PALETLER.alacakaranlik;

  it("keeps the spec's card ivory and the spec's street slate", () => {
    expect(ara.yuzeyKaldirim).toBe("#E3DAC8");
    expect(ara.bgAsfalt).toBe("#7A868C");
  });

  /**
   * `#7A868C` sits at the exact middle of the sunset and that is the
   * point of it — but a mid ground has almost no contrast to give. Pure
   * black reaches 5.62:1 on it and pure white only 3.74:1, so:
   *
   *  - no light ink can carry body type there at all, which is why the
   *    twilight street ink is dark while the twilight CARD ink is dark
   *    too and the night's is ivory; and
   *  - the whole usable band for type is [4.50, 5.62], which is 0.18 of
   *    a ratio point wider than the primary alone needs.
   *
   * So the twilight street gets ONE tonal level and the hierarchy is
   * carried by the type scale. Anyone who "fixes" that by fading the
   * secondary will fail the floor above; anyone who claims more headroom
   * exists will fail this.
   */
  it("cannot carry light type at all", () => {
    expect(kontrastOrani("#FFFFFF", ara.bgAsfalt)).toBeLessThan(YAZI_TABANI);
    expect(kontrastOrani(ara.yaziAna, ara.bgAsfalt)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it("has 5.62:1 of range in total, and spends 4.95 of it on the primary", () => {
    expect(kontrastOrani("#000000", ara.bgAsfalt)).toBeCloseTo(5.62, 1);
    expect(kontrastOrani(ara.yaziAnaZemin, ara.bgAsfalt)).toBeCloseTo(4.95, 1);
    expect(kontrastOrani(ara.yaziSisZemin, ara.bgAsfalt)).toBeCloseTo(4.78, 1);
    // The two levels are within a quarter of a ratio point of one another.
    // That is the honest measurement, not an accident.
    const fark =
      kontrastOrani(ara.yaziAnaZemin, ara.bgAsfalt) -
      kontrastOrani(ara.yaziSisZemin, ara.bgAsfalt);
    expect(fark).toBeGreaterThan(0);
    expect(fark).toBeLessThan(0.25);
  });

  /**
   * The pre-split palette put ONE pair on both sides of mid-lightness.
   * These are the four ratios that produced, kept as the reason the
   * split exists.
   */
  it("records the four ratios the single-family palette produced", () => {
    expect(kontrastOrani("#4B5A58", "#7A868C")).toBeCloseTo(1.93, 1); // sis on the street
    expect(kontrastOrani("#4B5A58", "#5F6B72")).toBeCloseTo(1.32, 1); // sis on the old recess
    expect(kontrastOrani("#12181F", "#5F6B72")).toBeCloseTo(3.26, 1); // ana on the old recess
    expect(kontrastOrani("#8A4A05", "#7A868C")).toBeCloseTo(1.83, 1); // money on the street
  });

  /**
   * And this is why the recess had to MOVE rather than take a better ink.
   * The redeem screen writes both on the bare recess (the district line,
   * above the opening) and inside the shop's own lamp, so an ink there has
   * to clear the floor in both states — and at `#5F6B72` nothing does, in
   * or out of the palette:
   *
   *   pure black   3.83 unlit / 4.97 lit
   *   pure white   5.48 unlit / 4.23 lit
   *   sign ivory   4.43 unlit / 3.42 lit
   *   deepest zinc 3.26 unlit / 4.23 lit
   *
   * Every column has a number under 4.5 in it. A mid-slate recess is not
   * a ground you can write on.
   */
  const ESKI_CUKUR = "#5F6B72";
  const ESKI_CUKUR_ISIKLI = isikAltindaZemin(
    { ...ara, bgDerin: ESKI_CUKUR },
    toplamAlfa(YAZI_DERINLIKLERI[0]!, ACIKLIK),
  );

  it.each(["#000000", "#FFFFFF", "#F2E6CE", "#12181F"])(
    "proves the old recess admitted no ink whatsoever — %s",
    (murekkep) => {
      const cip = kontrastOrani(murekkep, ESKI_CUKUR);
      const isikli = kontrastOrani(murekkep, ESKI_CUKUR_ISIKLI);
      expect(Math.min(cip, isikli)).toBeLessThan(YAZI_TABANI);
    },
  );

  it("takes the recess to the night side, where lit ivory reads", () => {
    expect(ara.bgDerin).toBe("#212A31");
    expect(kontrastOrani(ara.bgDerin, ara.bgAsfalt)).toBeGreaterThan(2.5);
    expect(kontrastOrani(ara.yaziAnaCukur, ara.bgDerin)).toBeGreaterThan(10);
  });
});

describe("the day palette's recess", () => {
  const gun = PALETLER.gunduz;

  it("needed its own secondary too — `yaziSis` was 3.82:1 there", () => {
    expect(kontrastOrani(gun.yaziSis, gun.bgDerin)).toBeCloseTo(3.82, 1);
    expect(kontrastOrani(gun.yaziSisCukur, gun.bgDerin)).toBeGreaterThanOrEqual(YAZI_TABANI);
  });

  it("keeps the street on the card pair, which already cleared it", () => {
    expect(gun.yaziAnaZemin).toBe(gun.yaziAna);
    expect(gun.yaziSisZemin).toBe(gun.yaziSis);
  });
});

describe("the night palette is untouched by the split", () => {
  const gece = PALETLER.gece;

  /**
   * At night the card, the street and the recess are all dark, so one
   * pair serves all three and every new token resolves to the value the
   * call site already had. This is the regression proof for the phase
   * this change did not set out to alter: if any of these drift, gece
   * has changed and the screenshots taken before the split no longer
   * match.
   */
  it("resolves every new token to the value it replaced", () => {
    expect(gece.yaziAnaZemin).toBe(gece.yaziAna);
    expect(gece.yaziSisZemin).toBe(gece.yaziSis);
    expect(gece.yaziAnaCukur).toBe(gece.yaziAna);
    expect(gece.yaziSisCukur).toBe(gece.yaziSis);
    expect(gece.sodyumYaziZemin).toBe(gece.sodyumYazi);
    expect(gece.sodyumYaziCukur).toBe(gece.sodyumYazi);
    expect(gece.hapYaziSis).toBe(gece.yaziSis);
    expect(gece.bgDerin).toBe("#0E141A");
  });

  it("resolves through the surface helper too", () => {
    for (const zemin of ["kart", "sokak", "cukur"] as const) {
      expect(anaYazi(gece, zemin)).toBe("#F2E6CE");
      expect(sisYazi(gece, zemin)).toBe("#9FB0AC");
      expect(sodyumYazisi(gece, zemin)).toBe("#FFB23F");
    }
  });
});

describe("the surface helper answers the same thing the tokens do", () => {
  it.each(FAZLAR)("%s", (ad) => {
    const p = PALETLER[ad];
    expect(anaYazi(p, "kart")).toBe(p.yaziAna);
    expect(anaYazi(p, "sokak")).toBe(p.yaziAnaZemin);
    expect(anaYazi(p, "cukur")).toBe(p.yaziAnaCukur);
    expect(sisYazi(p, "kart")).toBe(p.yaziSis);
    expect(sisYazi(p, "sokak")).toBe(p.yaziSisZemin);
    expect(sisYazi(p, "cukur")).toBe(p.yaziSisCukur);
    expect(sodyumYazisi(p, "kart")).toBe(p.sodyumYazi);
    expect(sodyumYazisi(p, "sokak")).toBe(p.sodyumYaziZemin);
    expect(sodyumYazisi(p, "cukur")).toBe(p.sodyumYaziCukur);
  });
});

/* ------------------------------------------------------------------ *
 * 7. THE RATIOS §1.1 PUBLISHES, and the laws that outlive the split
 * ------------------------------------------------------------------ */

describe("the ratios §1.1 publishes", () => {
  const gece = PALETLER.gece;
  const gunduz = PALETLER.gunduz;

  it.each([
    ["ivory on the night card", gece.yaziAna, gece.yuzeyKaldirim, 12.84],
    ["ivory on the night ground", gece.yaziAnaZemin, gece.bgAsfalt, 14.44],
    ["mist on the night card", gece.yaziSis, gece.yuzeyKaldirim, 7.01],
    ["sodium on the night card", gece.sodyumYazi, gece.yuzeyKaldirim, 8.83],
    ["asphalt ink on sodium", gece.sodyumMurekkep, gece.sodyumDolgu, 9.93],
    ["awning red on the night ground", gece.tenteYazi, gece.bgAsfalt, 4.93],
    ["ink on the day ground", gunduz.yaziAnaZemin, gunduz.bgAsfalt, 11.37],
    ["mist on the day card", gunduz.yaziSis, gunduz.yuzeyKaldirim, 5.85],
    ["dark amber on the day card", gunduz.sodyumYazi, gunduz.yuzeyKaldirim, 5.55],
    ["dark awning red on the day card", gunduz.tenteYazi, gunduz.yuzeyKaldirim, 5.41],
  ])("%s is %s:1", (_ad, on, alt, beklenen) => {
    expect(kontrastOrani(on, alt)).toBeCloseTo(beklenen, 1);
  });

  /**
   * Two numbers in §1.1 do not survive measurement, and the hex values —
   * not the printed ratios — are the source of truth:
   *
   *  • "text.primary … 14.6:1 on card" is the same pair as ivory-on-night-
   *    ground inverted, so it is 14.44:1.
   *  • "1pt #A9B5B7 border (1.27:1 against ground)" measures 1.34:1; the
   *    1.27 is the ivory CARD against that ground, which is exactly the
   *    difference the border exists to rescue.
   */
  it("records the two published ratios that measure differently", () => {
    expect(kontrastOrani(gunduz.yaziAna, gunduz.yuzeyKaldirim)).toBeCloseTo(14.44, 1);
    expect(kontrastOrani(gunduz.kartCizgi, gunduz.bgAsfalt)).toBeCloseTo(1.34, 1);
    expect(kontrastOrani(gunduz.yuzeyKaldirim, gunduz.bgAsfalt)).toBeCloseTo(1.27, 1);
  });
});

describe("the law: red is never type on a card (§1.1)", () => {
  it("is a rule because the fill colour genuinely fails there", () => {
    const gece = PALETLER.gece;
    expect(kontrastOrani(gece.tenteDolgu, gece.yuzeyKaldirim)).toBeCloseTo(4.38, 1);
    expect(kontrastOrani(gece.tenteDolgu, gece.yuzeyKaldirim)).toBeLessThan(YAZI_TABANI);
    expect(kontrastOrani(gece.tenteMurekkep, gece.tenteDolgu)).toBeGreaterThanOrEqual(
      YAZI_TABANI,
    );
    expect(kontrastOrani(gece.tenteYazi, gece.tenteYaziZemini)).toBeGreaterThanOrEqual(
      YAZI_TABANI,
    );
    expect(gece.tenteYaziZemini).toBe(gece.bgAsfalt);
  });
});

describe.each(FAZLAR)("%s — the card still has to be findable on the ground", (ad) => {
  const p = PALETLER[ad];

  it("separates the card from the ground it sits on", () => {
    // Not a WCAG floor — storefronts sit on a street with no separators
    // and no shadow (spec §3), so the only thing telling the eye where a
    // card ends is this difference. The light phases carry a 1pt border
    // precisely because the difference alone is 1.27:1 at noon.
    const fark = kontrastOrani(p.yuzeyKaldirim, p.bgAsfalt);
    if (p.kartCizgiKalinlik === 0) {
      expect(fark).toBeGreaterThan(1.1);
    } else {
      expect(kontrastOrani(p.kartCizgi, p.bgAsfalt)).toBeGreaterThan(1.2);
    }
  });

  it("keeps a lit stock square visible on the card", () => {
    expect(kontrastOrani(p.stokIsik, p.yuzeyKaldirim)).toBeGreaterThanOrEqual(IRI_TABANI);
  });

  it("keeps the shutter readable against the plaque behind it", () => {
    expect(kontrastOrani(p.metalCinko, p.plakaZemin)).toBeGreaterThanOrEqual(IRI_TABANI);
  });
});

describe("no green anywhere in the palette (§1.1 / §5.9)", () => {
  it.each(FAZLAR)("%s", (ad) => {
    const p = PALETLER[ad];
    const hexler = Object.values(p).filter(
      (v): v is string => typeof v === "string" && v.startsWith("#"),
    );
    for (const hex of hexler) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // "Green" here means a green that reads AS green: a green channel
      // clearly dominant over both others. The zinc family is very
      // slightly green-leaning (#5E6A67), which is what galvanised steel
      // looks like, and stays well inside this bound.
      const yesillik = g - Math.max(r, b);
      expect(yesillik).toBeLessThan(12);
    }
  });
});
