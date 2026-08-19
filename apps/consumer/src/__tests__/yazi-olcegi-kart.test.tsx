import { render, screen } from "@testing-library/react-native";
import { PixelRatio } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { ClockProvider } from "../design/saat";
import { ThemeProvider, usePalet } from "../design/theme";
import { kart } from "../design/tokens";
import { Tabela } from "../components/kepenk/Tabela";
import { VitrinKarti } from "../components/kepenk/VitrinKarti";
import { GERCEK_TEKLIFLER } from "../components/kepenk/gercek-teklifler";
import { KapaliKart } from "../components/kesif/KapaliKart";
import { tabelaGenisligi, TABELA_EN_KUCUK } from "../components/kepenk/tabela-olcu";
import { trUpper } from "../design/tr-upper";
import "../i18n";

/**
 * Dynamic type on the offer card and its sign — findings #5 and #6.
 *
 * Everything here is stated in DRAWN points: what a person at a raised
 * text setting actually has on glass. The numbers in the comments are the
 * arithmetic, spelled out, so the specs pin the requirement rather than
 * whatever the implementation currently computes.
 */

const [YELDEGIRMENI] = GERCEK_TEKLIFLER;
const SIMDI = new Date("2026-08-19T17:35:00.000Z"); // 20:35 Istanbul, inside the window

/** Pins `PixelRatio.getFontScale()` for one test. Captured and put back by
 * hand rather than `mockRestore()` — under jest-expo the react-native
 * module's own methods are already mocks with implementations, and
 * restoring a spy over a mock strips the implementation (see
 * test-utils/erisim.ts for the same trap). */
function yaziOlceginiAyarla(olcek: number): () => void {
  const onceki = PixelRatio.getFontScale;
  PixelRatio.getFontScale = jest.fn(() => olcek);
  return () => {
    PixelRatio.getFontScale = onceki;
  };
}

function stilDegerleri(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
  anahtar: string,
): number[] {
  if (!dugum) return [];
  if (Array.isArray(dugum)) return dugum.flatMap((d) => stilDegerleri(d, anahtar));
  const bulunan: number[] = [];
  const stil = dugum.props?.style;
  for (const s of Array.isArray(stil) ? stil.flat(4) : [stil]) {
    if (s && typeof s === "object" && typeof (s as Record<string, unknown>)[anahtar] === "number") {
      bulunan.push((s as Record<string, number>)[anahtar]!);
    }
  }
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") bulunan.push(...stilDegerleri(cocuk, anahtar));
  }
  return bulunan;
}

/** The `numberOfLines` of the node that draws the meta rail — found by
 * its own content ("19:00–21:00 · 399 m · 5 dk"), not by a testID the
 * component does not have. */
function metaSatirSayisi(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
): number | undefined {
  if (!dugum) return undefined;
  if (Array.isArray(dugum)) {
    for (const d of dugum) {
      const bulunan = metaSatirSayisi(d);
      if (bulunan !== undefined) return bulunan;
    }
    return undefined;
  }
  const metin = (dugum.children ?? [])
    .filter((c): c is string => typeof c === "string")
    .join("");
  if (/\d\d:\d\d.*·/.test(metin) && typeof dugum.props?.numberOfLines === "number") {
    return dugum.props.numberOfLines as number;
  }
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") {
      const bulunan = metaSatirSayisi(cocuk);
      if (bulunan !== undefined) return bulunan;
    }
  }
  return undefined;
}

/** The card itself: the one box in the tree that declares a width, a
 * height and `overflow: 'hidden'` — §3's "Fixed 358 × 196pt … overflow:
 * hidden", which is also exactly the clipping this spec is about. */
function kartYuksekligiBul(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
): number | undefined {
  if (!dugum) return undefined;
  if (Array.isArray(dugum)) {
    for (const d of dugum) {
      const bulunan = kartYuksekligiBul(d);
      if (bulunan !== undefined) return bulunan;
    }
    return undefined;
  }
  const stil = dugum.props?.style;
  const birlesik: Record<string, unknown> = {};
  for (const s of (Array.isArray(stil) ? stil.flat(4) : [stil]) as Record<string, unknown>[]) {
    if (s && typeof s === "object") Object.assign(birlesik, s);
  }
  if (
    birlesik.overflow === "hidden" &&
    typeof birlesik.height === "number" &&
    typeof birlesik.width === "number"
  ) {
    return birlesik.height;
  }
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") {
      const bulunan = kartYuksekligiBul(cocuk);
      if (bulunan !== undefined) return bulunan;
    }
  }
  return undefined;
}

function kartYuksekligi(): number {
  const bulunan = kartYuksekligiBul(screen.toJSON());
  if (bulunan === undefined) throw new Error("the card declared no height");
  return bulunan;
}

async function ciz(genislik?: number) {
  return render(
    <ClockProvider sabitZaman={SIMDI}>
      <ThemeProvider fazZorla="gece">
        <VitrinKarti teklif={YELDEGIRMENI} genislik={genislik} />
      </ThemeProvider>
    </ClockProvider>,
  );
}

/**
 * FINDING #5. At 1.3× the pavement block needs 108pt of the 96 the 232pt
 * card leaves it; `justifyContent: 'space-between'` degrades to flex-start
 * in a box that small and `overflow: 'hidden'` takes the last row — the
 * pickup window, the distance and the stock chip, gone off the bottom of
 * every card. iOS's XXL (1.235×) does not even reach the 1.3 step, so the
 * card never grows and loses ~5pt off the same rail.
 */
describe("the offer card grows to hold its own type (finding #5)", () => {
  it("is untouched at the default text size — §3's fixed 196", async () => {
    const geriAl = yaziOlceginiAyarla(1);
    const gorunum = await ciz();
    expect(kartYuksekligi()).toBe(kart.yukseklik);
    await gorunum.unmount();
    geriAl();
  });

  it("holds the whole pavement block at iOS's XXL (1.235×), where it used not to grow at all", async () => {
    const geriAl = yaziOlceginiAyarla(1.235);
    const gorunum = await ciz();
    // border 2 + tente 6 + kepenk 68 + tabela 40 = 116 of drawing, and
    // the block under it: paket 20×1.235 = 24.7, price 28×1.235 = 34.58,
    // değer çubuğu 4, meta rail max(16×1.235, chip 18) = 19.76, plus the
    // block's own 2pt bottom padding — 85.04. 201.04 in all; the card was
    // 196.
    expect(kartYuksekligi()).toBeGreaterThanOrEqual(201.04);
    await gorunum.unmount();
    geriAl();
  });

  it("holds it at the 1.3 step, where the price row stacks and both bands grow", async () => {
    const geriAl = yaziOlceginiAyarla(1.3);
    const gorunum = await ciz();
    // 2 + 6 + 78 + 48 = 134 of drawing. Block: paket 26, price 36.4,
    // value band 20.8 (its own row now), bar 4, meta rail 2 × 20.8 =
    // 41.6, padding 2 — 130.8. 264.8 in all; the card was 232.
    expect(kartYuksekligi()).toBeGreaterThanOrEqual(264.8);
    await gorunum.unmount();
    geriAl();
  });

  it("holds it at every ceiling the card declares (1.4×) — nothing on it grows past that", async () => {
    const geriAl = yaziOlceginiAyarla(1.4);
    const gorunum = await ciz();
    // paket 28, price 39.2, band 20.8, bar 4, meta 41.6, padding 2 =
    // 135.6, on 134 of drawing.
    expect(kartYuksekligi()).toBeGreaterThanOrEqual(269.6);
    await gorunum.unmount();
    geriAl();
  });

  it("stops growing past the ceilings — 2× and 1.4× are the same card", async () => {
    const geriAl14 = yaziOlceginiAyarla(1.4);
    const bir = await ciz();
    const yukseklik14 = kartYuksekligi();
    await bir.unmount();
    geriAl14();

    const geriAl2 = yaziOlceginiAyarla(2);
    const iki = await ciz();
    expect(kartYuksekligi()).toBe(yukseklik14);
    await iki.unmount();
    geriAl2();
  });

  it("gives the meta rail a second line at the large step, so the walk is not ellipsised away", async () => {
    const geriAl1 = yaziOlceginiAyarla(1);
    const bir = await ciz();
    expect(metaSatirSayisi(screen.toJSON())).toBe(1);
    await bir.unmount();
    geriAl1();

    const geriAl13 = yaziOlceginiAyarla(1.3);
    const iki = await ciz();
    expect(metaSatirSayisi(screen.toJSON())).toBe(2);
    // …and the wrap lands AFTER a separator, never before one: a line
    // that opens with "· 16 dk" reads as a bullet, not a continuation.
    expect(JSON.stringify(screen.toJSON())).toContain("\u00a0·");
    await iki.unmount();
    geriAl13();
  });

  it("the closed placeholder is the same height as the card that replaces it (§4.8)", async () => {
    const geriAl = yaziOlceginiAyarla(1.4);
    const kartGorunumu = await ciz();
    const dolu = kartYuksekligi();
    await kartGorunumu.unmount();

    const bosGorunum = await render(
      <ClockProvider sabitZaman={SIMDI}>
        <ThemeProvider fazZorla="gece">
          <KapaliKart />
        </ThemeProvider>
      </ClockProvider>,
    );
    expect(kartYuksekligi()).toBe(dolu);
    await bosGorunum.unmount();
    geriAl();
  });
});

/**
 * FINDING #6. `tabelaOlcusu()` fitted the name with Archivo Black's own
 * advances and never asked what the text would be DRAWN at, while the
 * `<Text>` under it scales to 1.4 — so the sign was measured at 1× and
 * painted at 1.3×, and five of the seven seeded shops lost the end of
 * their own name.
 */
describe("the sign says the whole shop's name at the user's text size (finding #6)", () => {
  const ADLAR = [
    "Yeldeğirmeni Pastanesi",
    "Moda Fırın",
    "Beşiktaş Manav Ali Usta",
    "Levent Fırın",
    "Mecidiyeköy Ocakbaşı",
    "Barbaros Lokantası",
    "Caferağa Kahve Evi",
  ];

  /** The plaque's inner width: the card's border, the plaque's own 12pt of
   * side inset, its 6pt padding, the two 3pt bolts and the 6pt gap each
   * side of the type — Tabela.tsx's own arithmetic. */
  const icGenislik = (kartGenisligi: number) => kartGenisligi - 2 - 2 * 12 - 12 - 6 - 12;

  function TabelaOrnegi({ ad, kartGenisligi }: { ad: string; kartGenisligi: number }) {
    const palet = usePalet();
    return (
      <Tabela
        genislik={kartGenisligi - 2}
        yukseklik={kart.tabelaBuyuk}
        ad={ad}
        palet={palet}
      />
    );
  }

  async function tabelaBoyutu(ad: string, kartGenisligi: number): Promise<number> {
    const gorunum = await render(
      <ClockProvider sabitZaman={SIMDI}>
        <ThemeProvider fazZorla="gece">
          <TabelaOrnegi ad={ad} kartGenisligi={kartGenisligi} />
        </ThemeProvider>
      </ClockProvider>,
    );
    const boyutlar = stilDegerleri(screen.toJSON(), "fontSize");
    await gorunum.unmount();
    return boyutlar[boyutlar.length - 1]!;
  }

  it.each([
    [1.3, 358],
    [1.4, 358],
    [1.3, 296],
    [1.4, 296],
  ])("fits every seeded name at %s× on a %spt card", async (olcek, kartGenisligi) => {
    const geriAl = yaziOlceginiAyarla(olcek);
    const alan = icGenislik(kartGenisligi);
    for (const ad of ADLAR) {
      const yazit = trUpper(ad);
      const boyut = await tabelaBoyutu(ad, kartGenisligi);
      // What RN will actually draw: the style size × the multiplier it is
      // allowed (`tabela.lg`'s own 1.4 ceiling).
      const cizilen = boyut * Math.min(olcek, 1.4);
      expect(tabelaGenisligi(yazit, cizilen)).toBeLessThanOrEqual(alan);
      // …and it never quietens below the legibility floor to get there.
      expect(cizilen).toBeGreaterThanOrEqual(TABELA_EN_KUCUK);
    }
    geriAl();
  });

  it("still grows a short name with the user — the sign is not frozen, it is fitted", async () => {
    const geriAl1 = yaziOlceginiAyarla(1);
    const bir = await tabelaBoyutu("Moda Fırın", 358);
    geriAl1();

    const geriAl14 = yaziOlceginiAyarla(1.4);
    const dortIkiBucuk = (await tabelaBoyutu("Moda Fırın", 358)) * 1.4;
    geriAl14();

    expect(dortIkiBucuk).toBeGreaterThan(bir);
  });

  it("is byte-for-byte the reviewed sign at the default text size", async () => {
    const geriAl = yaziOlceginiAyarla(1);
    expect(await tabelaBoyutu("Moda Fırın", 358)).toBe(20);
    expect(await tabelaBoyutu("Yeldeğirmeni Pastanesi", 358)).toBe(20);
    geriAl();
  });
});
