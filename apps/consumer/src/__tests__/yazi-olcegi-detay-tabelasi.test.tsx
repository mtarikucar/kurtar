import { render, screen } from "@testing-library/react-native";
import { PixelRatio } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { ClockProvider } from "../design/saat";
import { ThemeProvider, usePalet } from "../design/theme";
import { s } from "../design/tokens";
import { DetayBasligi } from "../components/teslim/DetayBasligi";
import { tabelaGenisligi } from "../components/kepenk/tabela-olcu";
import { trUpper } from "../design/tr-upper";
import "../i18n";

/**
 * Dynamic type on the OFFER DETAIL's sign — the same defect finding #6
 * found on the card, one component over.
 *
 * `detayTabelaBoyutu()` fitted the name with Archivo Black's own advances
 * and never asked what the text would be DRAWN at, while the `<Text>`
 * under it carries `tabela.xl`'s 1.4 ceiling. Measured at 1×, painted at
 * 1.4× — and this plaque is a FIXED 56pt object on §4.3's fixed Y with
 * `numberOfLines={1}`, so the overflow does not wrap, it truncates. Six of
 * the seven seeded shops lost the end of their own name on the page whose
 * whole job is to say which shop you are standing in front of.
 *
 * Everything below is stated in DRAWN points: what a person at a raised
 * text setting actually has on glass.
 */

const SIMDI = new Date("2026-08-19T17:35:00.000Z"); // 20:35 Istanbul

const ADLAR = [
  "Yeldeğirmeni Pastanesi",
  "Moda Fırın",
  "Beşiktaş Manav Ali Usta",
  "Levent Fırın",
  "Mecidiyeköy Ocakbaşı",
  "Barbaros Lokantası",
  "Caferağa Kahve Evi",
];

/** `tabela.xl`'s own ceiling (§1.2: "1.4 on the tabela"). */
const TAVAN_CARPANI = 1.4;
/** The floor, in drawn points — the size below which the sign stops being
 * a sign at arm's length. */
const EN_KUCUK_CIZILEN = 18;
/** DetayBasligi's plaque: a 56pt band, less its own 8pt of vertical
 * margin each side and its 1.5pt border each side. The single line the
 * name is drawn on has to fit INSIDE this. */
const SATIR_KUTUSU = 56 - 2 * s.s2 - 2 * 1.5;

/** Pins `PixelRatio.getFontScale()` for one test. Captured and put back by
 * hand rather than `mockRestore()` — see test-utils/erisim.ts. */
function yaziOlceginiAyarla(olcek: number): () => void {
  const onceki = PixelRatio.getFontScale;
  PixelRatio.getFontScale = jest.fn(() => olcek);
  return () => {
    PixelRatio.getFontScale = onceki;
  };
}

/** The node whose own text IS the sign — found by its content, not by a
 * position in the tree: the meta rail below the plaque also carries a
 * `fontSize`, and "the last one" quietly measured that instead. */
function metniniCizenDugum(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
  metin: string,
): ReactTestRendererJSON | null {
  if (!dugum) return null;
  if (Array.isArray(dugum)) {
    for (const d of dugum) {
      const bulunan = metniniCizenDugum(d, metin);
      if (bulunan) return bulunan;
    }
    return null;
  }
  const kendi = (dugum.children ?? [])
    .filter((c): c is string => typeof c === "string")
    .join("");
  if (kendi === metin) return dugum;
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") {
      const bulunan = metniniCizenDugum(cocuk, metin);
      if (bulunan) return bulunan;
    }
  }
  return null;
}

function birlesikStil(dugum: ReactTestRendererJSON): Record<string, unknown> {
  const stil = dugum.props?.style;
  const birlesik: Record<string, unknown> = {};
  for (const bicim of (Array.isArray(stil) ? stil.flat(4) : [stil]) as Record<
    string,
    unknown
  >[]) {
    if (bicim && typeof bicim === "object") Object.assign(birlesik, bicim);
  }
  return birlesik;
}

/** The plaque's inner width, DetayBasligi's own arithmetic: the card's
 * 16pt side inset, the plaque's 6pt padding, the two 3pt bolts and the
 * 6pt gap each side of the type. */
const icGenislik = (genislik: number) => genislik - 2 * s.s4 - 12 - 6 - 12;

function Ornek({ ad, genislik }: { ad: string; genislik: number }) {
  const palet = usePalet();
  return (
    <DetayBasligi
      genislik={genislik}
      dukkanId="store-1"
      dukkanAdi={ad}
      kategori="BAKERY"
      p={0.4}
      guc={0.8}
      durum="acik"
      kalanDk={25}
      acilisSaati="19:00"
      kalanAdet={6}
      meta="Fırın · Kadıköy, İstanbul"
      puan="★ 4,7 · 212"
      palet={palet}
      azaltHareket={false}
    />
  );
}

async function tabelaBicimi(
  ad: string,
  genislik: number,
): Promise<{ boyut: number; satirYuksekligi: number }> {
  const gorunum = await render(
    <ClockProvider sabitZaman={SIMDI}>
      <ThemeProvider fazZorla="gece">
        <Ornek ad={ad} genislik={genislik} />
      </ThemeProvider>
    </ClockProvider>,
  );
  const dugum = metniniCizenDugum(screen.toJSON(), trUpper(ad));
  if (!dugum) throw new Error(`the sign never drew ${trUpper(ad)}`);
  const bicim = birlesikStil(dugum);
  await gorunum.unmount();
  return {
    boyut: bicim.fontSize as number,
    satirYuksekligi: bicim.lineHeight as number,
  };
}

describe("the offer detail's sign says the whole shop's name at the user's text size", () => {
  it.each([
    [1.3, 390],
    [1.4, 390],
    [1.4, 360],
  ])("fits every seeded name at %s× on a %spt screen", async (olcek, ekran) => {
    const geriAl = yaziOlceginiAyarla(olcek);
    try {
      const alan = icGenislik(ekran);
      for (const ad of ADLAR) {
        const yazit = trUpper(ad);
        const { boyut } = await tabelaBicimi(ad, ekran);
        // What RN will actually put on glass: the style size × the
        // multiplier this Text is allowed.
        const cizilen = boyut * Math.min(olcek, TAVAN_CARPANI);
        expect(tabelaGenisligi(yazit, cizilen)).toBeLessThanOrEqual(alan);
        // …and it never quietens below the legibility floor to get there.
        expect(cizilen).toBeGreaterThanOrEqual(EN_KUCUK_CIZILEN);
      }
    } finally {
      geriAl();
    }
  });

  it("keeps the drawn line inside the plaque's fixed 56pt band", async () => {
    const geriAl = yaziOlceginiAyarla(1.4);
    try {
      for (const ad of ADLAR) {
        const { satirYuksekligi } = await tabelaBicimi(ad, 390);
        expect(satirYuksekligi * TAVAN_CARPANI).toBeLessThanOrEqual(SATIR_KUTUSU);
      }
    } finally {
      geriAl();
    }
  });

  it("still grows a short name with the user — the sign is fitted, not frozen", async () => {
    const geriAl1 = yaziOlceginiAyarla(1);
    const bir = (await tabelaBicimi("Moda Fırın", 390)).boyut;
    geriAl1();

    const geriAl14 = yaziOlceginiAyarla(1.4);
    const buyuk = (await tabelaBicimi("Moda Fırın", 390)).boyut * 1.4;
    geriAl14();

    expect(buyuk).toBeGreaterThan(bir);
  });

  it("is byte-for-byte the reviewed sign at the default text size", async () => {
    const geriAl = yaziOlceginiAyarla(1);
    try {
      // 390 − 32 − 30 = 328pt of plaque. Archivo Black's advances put
      // "MODA FIRIN" past the 28pt ceiling and the two longest seeded
      // names at 21pt inside it — the sizes the design was reviewed at.
      expect((await tabelaBicimi("Moda Fırın", 390)).boyut).toBe(28);
      expect((await tabelaBicimi("Yeldeğirmeni Pastanesi", 390)).boyut).toBe(21);
      expect((await tabelaBicimi("Beşiktaş Manav Ali Usta", 390)).boyut).toBe(21);
      // Absolute leading, never a multiplier (§1.2).
      expect((await tabelaBicimi("Moda Fırın", 390)).satirYuksekligi).toBe(32);
    } finally {
      geriAl();
    }
  });
});
