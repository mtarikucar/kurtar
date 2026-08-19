import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder } from "node:util";
import type { Font, FontCollection } from "fontkit";
import { UYGULAMA_FONTLARI } from "../design/fonts";

/**
 * fontkit builds a `new TextDecoder('ascii')` at module load, and the
 * Winter runtime polyfill jest-expo installs accepts utf-8 labels only —
 * so Node's own decoder is restored before fontkit is pulled in. This is
 * also why fontkit is `require`d rather than imported: the assignment has
 * to happen first, and ESM imports hoist above it.
 */
globalThis.TextDecoder = NodeTextDecoder as typeof globalThis.TextDecoder;

interface FontkitModulu {
  /** `create(buffer)` rather than `openSync(path)`: under jest-expo the
   * BROWSER build of fontkit resolves, and it exposes no filesystem
   * entry point — reading the bytes here works against every build. */
  create(veri: Buffer): Font | FontCollection;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("fontkit") as FontkitModulu;

/**
 * Ship guard, in CI, not at runtime (spec §1.2).
 *
 * A runtime width probe can be fooled — a fallback face renders SOMETHING
 * for every codepoint. So the three families are opened with fontkit and
 * asked directly whether they carry the Turkish pairs, and the build fails
 * rather than shipping tofu (or a silently substituted Roboto ğ) to a
 * Turkish user. U+0130/U+0131 in particular is the pair that disqualifies
 * most display faces.
 */

const TURKCE_HARFLER: ReadonlyArray<readonly [string, number]> = [
  ["Ğ", 0x011e],
  ["ğ", 0x011f],
  ["Ş", 0x015e],
  ["ş", 0x015f],
  ["İ", 0x0130],
  ["ı", 0x0131],
  ["Ç", 0x00c7],
  ["ç", 0x00e7],
  ["Ö", 0x00d6],
  ["ö", 0x00f6],
  ["Ü", 0x00dc],
  ["ü", 0x00fc],
];

/** In "×3,5 değer" and every chip: needed in every face. */
const CARPI: readonly [string, number] = ["×", 0x00d7];

/**
 * The lira sign, needed only in the faces that set money.
 *
 * Archivo Black does NOT carry U+20BA — which is fine and is the reason
 * this list is per-face rather than global: the display face sets shop
 * names and nothing else, prices are Chivo Mono (spec §1.2), and money is
 * never typeset in the tabela face. If a price ever appears in Archivo
 * Black it will render tofu, and this table is the record of why.
 */
const LIRA: readonly [string, number] = ["₺", 0x20ba];

function paketKoku(paket: string): string {
  return path.dirname(require.resolve(`${paket}/package.json`));
}

const ARCHIVO = paketKoku("@expo-google-fonts/archivo");
const ARCHIVO_BLACK = paketKoku("@expo-google-fonts/archivo-black");
const CHIVO_MONO = paketKoku("@expo-google-fonts/chivo-mono");

/** [name, ttf path, sets money?] */
const DOSYALAR: ReadonlyArray<readonly [string, string, boolean]> = [
  ["Archivo_400Regular", `${ARCHIVO}/400Regular/Archivo_400Regular.ttf`, true],
  ["Archivo_500Medium", `${ARCHIVO}/500Medium/Archivo_500Medium.ttf`, true],
  ["Archivo_600SemiBold", `${ARCHIVO}/600SemiBold/Archivo_600SemiBold.ttf`, true],
  ["Archivo_700Bold", `${ARCHIVO}/700Bold/Archivo_700Bold.ttf`, true],
  ["ArchivoBlack_400Regular", `${ARCHIVO_BLACK}/400Regular/ArchivoBlack_400Regular.ttf`, false],
  ["ChivoMono_500Medium", `${CHIVO_MONO}/500Medium/ChivoMono_500Medium.ttf`, true],
  ["ChivoMono_700Bold", `${CHIVO_MONO}/700Bold/ChivoMono_700Bold.ttf`, true],
];

function tekFont(yol: string): Font {
  const acilan: Font | FontCollection = fontkit.create(fs.readFileSync(yol));
  if ("fonts" in acilan) {
    throw new Error(`${yol}: bir koleksiyon, tek font bekleniyordu`);
  }
  return acilan;
}

describe("Turkish glyph coverage over the shipped TTFs (§1.2)", () => {
  it("loads exactly the seven files the type scale names", () => {
    expect(Object.keys(UYGULAMA_FONTLARI).sort()).toEqual(
      DOSYALAR.map(([ad]) => ad).sort(),
    );
    for (const [, yol] of DOSYALAR) {
      expect(fs.existsSync(yol)).toBe(true);
    }
  });

  describe.each(DOSYALAR)("%s", (_ad, yol, paraSeti) => {
    const font = tekFont(yol);

    it.each(TURKCE_HARFLER)("carries %s (U+%s)", (harf, kod) => {
      expect(font.hasGlyphForCodePoint(kod)).toBe(true);
      // A cmap hit is not enough on its own: glyph 0 IS .notdef, i.e. the
      // tofu box. The drawn outline has to exist.
      expect(font.glyphForCodePoint(kod).id).not.toBe(0);
      expect(harf.codePointAt(0)).toBe(kod);
    });

    it(`carries ${CARPI[0]}`, () => {
      expect(font.hasGlyphForCodePoint(CARPI[1])).toBe(true);
      expect(font.glyphForCodePoint(CARPI[1]).id).not.toBe(0);
    });

    if (paraSeti) {
      it(`carries ${LIRA[0]}`, () => {
        expect(font.hasGlyphForCodePoint(LIRA[1])).toBe(true);
        expect(font.glyphForCodePoint(LIRA[1]).id).not.toBe(0);
      });
    }

    /**
     * The negative control. Without it, an assertion that always answers
     * "true" would pass this whole file forever and the guard would be
     * decorative — this proves the probe can still say no. CJK is not in
     * a latin-ext subset and must come back missing.
     */
    it("reports a codepoint it does NOT carry as missing", () => {
      const cjk = 0x4e2d; // 中
      expect(font.hasGlyphForCodePoint(cjk)).toBe(false);
    });
  });
});
