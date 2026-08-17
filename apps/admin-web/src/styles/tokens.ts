import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

/**
 * Bridges `@kurtar/ui-tokens` (plain TS numbers/hex strings, no CSS) into
 * CSS custom properties on `:root`, so every `.module.css` file in this app
 * can use real CSS (`:hover`, `:focus-visible`, media queries — none of
 * which inline styles support well) while `@kurtar/ui-tokens` stays the
 * ONE source of truth for every value, per docs/frontend-contract.md §5
 * ("Colors/spacing/type from @kurtar/ui-tokens. No second palette.").
 *
 * Called once from `main.tsx`, before the app renders. Spacing/radii/
 * typeScale are plain numbers (no unit baked in, per ui-tokens' own doc
 * comments) — this is the ONE place in the app that appends "px", so every
 * consumer downstream (CSS files) just uses `var(--space-md)` etc.
 */
export function injectDesignTokens(): void {
  const root = document.documentElement;
  const set = (name: string, value: string) =>
    root.style.setProperty(name, value);

  for (const [step, hex] of Object.entries(colors.primary)) {
    set(`--color-primary-${step}`, hex);
  }
  for (const [step, hex] of Object.entries(colors.secondary)) {
    set(`--color-secondary-${step}`, hex);
  }
  for (const [step, hex] of Object.entries(colors.neutral)) {
    set(`--color-neutral-${step}`, hex);
  }
  for (const [name, ramp] of Object.entries(colors.semantic)) {
    for (const [step, hex] of Object.entries(ramp)) {
      set(`--color-${name}-${step}`, hex);
    }
  }

  for (const [name, value] of Object.entries(spacing)) {
    set(`--space-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(radii)) {
    set(`--radius-${name}`, `${value}px`);
  }
  for (const [name, scale] of Object.entries(typeScale)) {
    set(`--font-size-${name}`, `${scale.size}px`);
    set(`--line-height-${name}`, `${scale.lineHeight}px`);
    set(`--font-weight-${name}`, scale.weight);
  }
}
