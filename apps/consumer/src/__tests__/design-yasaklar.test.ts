import fs from "node:fs";
import path from "node:path";
import { m, r } from "../design/tokens";

/**
 * §5 — "What NOT to do", as a test.
 *
 * Each of these is a temptation the spec names, a reason the direction
 * breaks if you give in, and a line of code you can grep for. A reviewer
 * can miss one; this cannot.
 */

const KOK = path.resolve(__dirname, "..");
const KEPENK = path.join(KOK, "components", "kepenk");

function kaynaklar(dizin: string): string[] {
  const cikti: string[] = [];
  for (const giris of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, giris.name);
    if (giris.isDirectory()) {
      cikti.push(...kaynaklar(tam));
    } else if (/\.tsx?$/.test(giris.name)) {
      cikti.push(tam);
    }
  }
  return cikti;
}

const TUM_KAYNAK = kaynaklar(KOK).filter((p) => !p.includes(`${path.sep}__tests__${path.sep}`));
const KEPENK_KAYNAK = kaynaklar(KEPENK);

function oku(dosya: string): string {
  return fs.readFileSync(dosya, "utf8");
}

/**
 * The rules below are greps, and this file's own subject matter is full
 * of prose ABOUT the forbidden strings — every one of these components
 * documents the rule it obeys. So the scans run over code with comments
 * stripped: what the code does, not what it says about itself.
 */
function kod(dosya: string): string {
  return oku(dosya)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("§5.6 — Turkish casing", () => {
  it("never uses textTransform anywhere in the app", () => {
    const suclular = TUM_KAYNAK.filter((d) => kod(d).includes("textTransform"));
    expect(suclular).toEqual([]);
  });

  it("only calls toUpperCase() inside trUpper(), which fixes it", () => {
    const suclular = TUM_KAYNAK.filter(
      (d) => kod(d).includes(".toUpperCase()") && !d.endsWith("tr-upper.ts"),
    ).map((d) => path.relative(KOK, d));
    // glyphs.ts normalises an API enum, not user-visible text.
    expect(suclular).toEqual(["components/kepenk/glyphs.ts"]);
  });
});

describe("§5.1 / §5.2 — the chassis", () => {
  it("keeps the card radius at 4", () => {
    expect(r.card).toBe(4);
  });

  it("casts no shadow and raises no elevation in the signature", () => {
    for (const dosya of KEPENK_KAYNAK) {
      const kaynak = kod(dosya);
      expect(kaynak).not.toMatch(/shadow(Color|Opacity|Radius|Offset)/);
      expect(kaynak).not.toMatch(/elevation:\s*[1-9]/);
    }
  });
});

describe("§5.3 / §5.4 — how the shutter is drawn and moved", () => {
  const kepenk = kod(path.join(KEPENK, "Kepenk.tsx"));

  it("draws the corrugation as ONE pattern-filled rect, not one node per slat", () => {
    expect(kepenk).toContain("<Pattern");
    const rectSayisi = (kepenk.match(/<Rect/g) ?? []).length;
    // Two inside the pattern tile, one body, one lip, one specular line.
    expect(rectSayisi).toBeLessThanOrEqual(5);
  });

  it("moves it on translateY alone — never y/height geometry", () => {
    expect(kepenk).toContain("translateY");
    expect(kepenk).not.toContain("createAnimatedComponent");
    expect(kepenk).not.toMatch(/height=\{kaydir/);
    expect(kepenk).not.toMatch(/y=\{kaydir/);
  });

  it("snaps the translate to whole pixels, because patterns seam at fractions", () => {
    expect(kepenk).toMatch(/Math\.round\(band \* \(1 - p\)\)/);
  });
});

describe("§5.5 — brand type is never inside SVG", () => {
  it("imports no SVG <Text> in the signature", () => {
    for (const dosya of KEPENK_KAYNAK) {
      const kaynak = kod(dosya);
      const svgImport = kaynak.match(/from "react-native-svg";/);
      if (!svgImport) continue;
      expect(kaynak).not.toMatch(/import Svg, \{[^}]*\bText\b/);
      expect(kaynak).not.toMatch(/\bTSpan\b/);
    }
  });
});

describe("§5.7 — gradients end at rgba(...,0), never 'transparent'", () => {
  it("has no 'transparent' colour anywhere in the design layer", () => {
    const dosyalar = [...KEPENK_KAYNAK, ...kaynaklar(path.join(KOK, "design"))];
    for (const dosya of dosyalar) {
      expect(kod(dosya)).not.toMatch(/["']transparent["']/);
    }
  });
});

describe("§5.8 — no fabricated struck-through price", () => {
  it("never sets a line-through anywhere in the signature", () => {
    for (const dosya of KEPENK_KAYNAK) {
      expect(kod(dosya)).not.toContain("line-through");
    }
  });
});

describe("§5.10 — the whole micro-interaction budget", () => {
  it("is one opacity", () => {
    expect(m.pressOpacity).toBe(0.85);
    const kart = kod(path.join(KEPENK, "VitrinKarti.tsx"));
    expect(kart).toContain("opacity: m.pressOpacity");
    expect(kart).not.toMatch(/scale:/);
  });

  it("pulls in no confetti, no Lottie, no shimmer, no second animation engine", () => {
    const paket = JSON.parse(
      fs.readFileSync(path.resolve(KOK, "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const yasak = /lottie|confetti|shimmer|skeleton|reanimated|moti/i;
    const suclular = Object.keys(paket.dependencies).filter((ad) => yasak.test(ad));
    expect(suclular).toEqual([]);
  });
});

describe("§5.14 / §5.15 — no tilt, no photography", () => {
  it("never rotates the card itself", () => {
    const kart = kod(path.join(KEPENK, "VitrinKarti.tsx"));
    const rotasyonlar = kart.match(/rotate: "(-?[\d.]+)deg"/g) ?? [];
    // Exactly one rotated element on the card: the TÜKENDİ sticker.
    expect(rotasyonlar).toEqual(['rotate: "-4deg"']);
  });

  it("fetches no image, ever — the tente and the glyph ARE the identity", () => {
    for (const dosya of KEPENK_KAYNAK) {
      const kaynak = kod(dosya);
      expect(kaynak).not.toMatch(/\bImage\b/);
      expect(kaynak).not.toContain("coverImageUrl");
      expect(kaynak).not.toMatch(/https?:\/\//);
    }
  });
});
