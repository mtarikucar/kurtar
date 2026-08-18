import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

/**
 * [M19 fix / M8 cross-cutting guard — mirrors apps/admin-web's own copy of
 * this test] Every `.module.css` file in this app is meant to read
 * colors/spacing/radii/type ONLY through the CSS custom properties
 * `styles/theme.ts`'s `injectThemeVariables()` actually sets on `:root` —
 * that function is the single bridge from `@kurtar/ui-tokens` into real
 * CSS. A `var(--color-border)` or `var(--color-text-secondary)` reference
 * that the bridge never produces isn't a type error and isn't a lint
 * error: the property it sits in just silently falls back to its
 * CSS-spec initial value at computed-value time — exactly what happened
 * to PickupListSection's row border and secondary text before M19's fix.
 * This test re-derives the exact same variable names
 * `injectThemeVariables()` would set and fails loudly the moment any
 * `.module.css` file references one that isn't in that set.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SRC_ROOT = path.resolve(__dirname, "..");

function expectedTokenVarNames(): Set<string> {
  const names = new Set<string>();
  for (const step of Object.keys(colors.primary))
    names.add(`color-primary-${step}`);
  for (const step of Object.keys(colors.secondary))
    names.add(`color-secondary-${step}`);
  for (const [name, ramp] of Object.entries(colors.semantic)) {
    for (const step of Object.keys(ramp)) names.add(`color-${name}-${step}`);
  }
  for (const step of Object.keys(colors.neutral))
    names.add(`color-neutral-${step}`);
  for (const name of Object.keys(spacing)) names.add(`space-${name}`);
  for (const name of Object.keys(radii)) names.add(`radius-${name}`);
  for (const name of Object.keys(typeScale)) {
    names.add(`font-size-${name}`);
    names.add(`line-height-${name}`);
    names.add(`font-weight-${name}`);
  }
  return names;
}

function findModuleCssFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findModuleCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".module.css")) {
      files.push(full);
    }
  }
  return files;
}

describe("every var(--...) in a *.module.css file is a token injectThemeVariables() actually sets", () => {
  const expected = expectedTokenVarNames();
  const cssFiles = findModuleCssFiles(SRC_ROOT);

  it("finds at least one .module.css file to check (sanity check on the walk itself)", () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  for (const file of cssFiles) {
    const relPath = path.relative(REPO_ROOT, file);
    it(`${relPath} references only defined tokens`, () => {
      const css = fs.readFileSync(file, "utf8");
      const used = [...css.matchAll(/var\(--([a-zA-Z0-9-]+)/g)].map(
        (m) => m[1],
      );
      const undefinedVars = used.filter((name) => !expected.has(name));
      expect(
        undefinedVars,
        `undefined CSS custom properties in ${relPath}`,
      ).toEqual([]);
    });
  }
});
