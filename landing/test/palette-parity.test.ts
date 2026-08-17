import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { colors } from "@kurtar/ui-tokens";

/**
 * Enforces the palette mirror that `landing/app/globals.css`'s own doc
 * comment claims ("every color below is a named step from
 * @kurtar/ui-tokens ... never an invented hex") but that nothing actually
 * checked. `landing` cannot literally `import "@kurtar/ui-tokens"` from a
 * plain `.css` file or a static `.svg`/`.json` asset — CSS custom
 * properties and static assets have no module system — so those three
 * spots are, and will stay, hand-copied hex values. This test is the
 * enforcement instead: it re-derives the same hex values from the real
 * `@kurtar/ui-tokens` package and fails loudly the moment any of these
 * three drifts from it, rather than trusting a doc comment nobody
 * re-checks.
 *
 * `landing/app/[locale]/opengraph-image.tsx` is NOT covered here — that
 * file is a real `.tsx` module, so it imports `colors` from
 * `@kurtar/ui-tokens` directly instead of needing a parity check (see its
 * own source).
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

describe("landing's hand-copied palette matches @kurtar/ui-tokens", () => {
  it("globals.css's CSS custom properties match their documented token step exactly", () => {
    const css = fs.readFileSync(
      path.join(REPO_ROOT, "landing/app/globals.css"),
      "utf8",
    );

    function cssVar(name: string): string {
      const match = css.match(
        new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`),
      );
      if (!match) {
        throw new Error(`globals.css: could not find --${name}`);
      }
      return normalizeHex(match[1]);
    }

    const expectedByVar: Record<string, string> = {
      "color-orange-50": colors.primary[50],
      "color-orange-100": colors.primary[100],
      "color-orange-200": colors.primary[200],
      "color-orange-500": colors.primary[500],
      "color-orange-600": colors.primary[600],
      "color-orange-700": colors.primary[700],
      "color-green-50": colors.secondary[50],
      "color-green-100": colors.secondary[100],
      "color-green-500": colors.secondary[500],
      "color-green-600": colors.secondary[600],
      "color-green-700": colors.secondary[700],
      "color-danger-500": colors.semantic.danger[500],
      "color-danger-700": colors.semantic.danger[700],
      "color-warning-500": colors.semantic.warning[500],
      "color-info-500": colors.semantic.info[500],
      "color-ink": colors.neutral[900],
      "color-ink-soft": colors.neutral[600],
      "color-ink-faint": colors.neutral[500],
      "color-paper": colors.neutral[50],
      "color-kraft": colors.neutral[100],
      "color-line": colors.neutral[200],
      "color-line-strong": colors.neutral[300],
      "color-white": colors.neutral[0],
    };

    for (const [varName, expectedHex] of Object.entries(expectedByVar)) {
      expect(cssVar(varName), `--${varName}`).toBe(normalizeHex(expectedHex));
    }
  });

  it("app/icon.svg's fill/stroke colors match neutral[900]/primary[500]/secondary[500]", () => {
    const svg = fs.readFileSync(
      path.join(REPO_ROOT, "landing/app/icon.svg"),
      "utf8",
    );
    const hexes = [...svg.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
      normalizeHex(m[0]),
    );

    expect(hexes, "icon.svg's background fill").toContain(
      normalizeHex(colors.neutral[900]),
    );
    expect(hexes, "icon.svg's mark stroke").toContain(
      normalizeHex(colors.primary[500]),
    );
    expect(hexes, "icon.svg's accent dot fill").toContain(
      normalizeHex(colors.secondary[500]),
    );
    // Every hex actually present must be one of these three — an
    // unexpected fourth color is exactly the kind of silent drift this
    // test exists to catch.
    const allowed = new Set([
      normalizeHex(colors.neutral[900]),
      normalizeHex(colors.primary[500]),
      normalizeHex(colors.secondary[500]),
    ]);
    for (const hex of hexes) {
      expect(allowed.has(hex), `unexpected color ${hex} in icon.svg`).toBe(
        true,
      );
    }
  });

  it("apps/consumer/app.json's brand color fields match primary[500]", () => {
    const raw = fs.readFileSync(
      path.join(REPO_ROOT, "apps/consumer/app.json"),
      "utf8",
    );
    const appJson = JSON.parse(raw);

    expect(
      normalizeHex(appJson.expo.android.adaptiveIcon.backgroundColor),
      "expo.android.adaptiveIcon.backgroundColor",
    ).toBe(normalizeHex(colors.primary[500]));

    const notificationsPlugin = (
      appJson.expo.plugins as Array<string | [string, Record<string, unknown>]>
    ).find(
      (p): p is [string, Record<string, unknown>] =>
        Array.isArray(p) && p[0] === "expo-notifications",
    );
    expect(
      notificationsPlugin,
      "expo-notifications plugin entry",
    ).toBeTruthy();
    expect(
      normalizeHex(notificationsPlugin![1].color as string),
      "expo-notifications plugin's color",
    ).toBe(normalizeHex(colors.primary[500]));
  });
});
