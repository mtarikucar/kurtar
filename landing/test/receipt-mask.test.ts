import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The receipt is the home page's signature device — the one place the site
 * shows what a bag actually costs against what is in it.
 *
 * It shipped invisible. A single mask layer sized to the bottom notch
 * strip masks out everything the layer does not cover, so the card above
 * that strip simply was not painted: a white box with a pretty torn edge
 * and nothing above it. The base layer is what makes the scallop a
 * decoration rather than an eraser, so it is pinned here.
 */
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

function kural(ad: string): string {
  const i = css.indexOf(`.${ad} {`);
  if (i === -1) throw new Error(`${ad} kuralı yok`);
  return css.slice(i, css.indexOf("}", i));
}

describe(".kt-receipt — the scallop tears the edge, it does not erase the card", () => {
  const receipt = kural("kt-receipt");

  it("declares a base mask layer alongside the scallop, for both prefixes", () => {
    for (const onek of ["", "-webkit-"]) {
      const repeat = new RegExp(`${onek}mask-repeat:\\s*no-repeat,\\s*repeat-x`).test(receipt);
      expect(repeat, `${onek}mask-repeat must list a base layer first`).toBe(true);
      expect(receipt).toContain(`${onek}mask-image:\n    linear-gradient(black, black),`);
    }
  });

  it("sizes the base layer to everything above the notch, so no part of the card is left unpainted", () => {
    for (const onek of ["", "-webkit-"]) {
      const i = receipt.indexOf(`${onek}mask-size:`);
      expect(i, `${onek}mask-size missing`).toBeGreaterThan(-1);
      expect(receipt.slice(i, i + 120)).toContain("100% calc(100% - var(--receipt-notch))");
    }
  });
});
