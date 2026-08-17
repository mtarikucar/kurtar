import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

/**
 * The ONE bridge from @kurtar/ui-tokens's plain-TS constants into CSS
 * custom properties every *.module.css file in this app reads from
 * (`var(--color-primary-500)`, `var(--space-lg)`, ...). This is not a
 * second palette — every value here is read straight off the shared
 * package at runtime, so a token change there propagates automatically
 * with nothing to keep in sync by hand. Injected once, synchronously,
 * before the first React render (see main.tsx) so nothing ever paints
 * with unresolved custom properties.
 */
function buildCssText(): string {
  const lines: string[] = [];

  for (const [step, hex] of Object.entries(colors.primary)) {
    lines.push(`--color-primary-${step}: ${hex};`);
  }
  for (const [step, hex] of Object.entries(colors.secondary)) {
    lines.push(`--color-secondary-${step}: ${hex};`);
  }
  for (const [name, ramp] of Object.entries(colors.semantic)) {
    for (const [step, hex] of Object.entries(ramp)) {
      lines.push(`--color-${name}-${step}: ${hex};`);
    }
  }
  for (const [step, hex] of Object.entries(colors.neutral)) {
    lines.push(`--color-neutral-${step}: ${hex};`);
  }
  for (const [name, px] of Object.entries(spacing)) {
    lines.push(`--space-${name}: ${px}px;`);
  }
  for (const [name, px] of Object.entries(radii)) {
    lines.push(`--radius-${name}: ${px}px;`);
  }
  for (const [name, scale] of Object.entries(typeScale)) {
    lines.push(`--font-size-${name}: ${scale.size}px;`);
    lines.push(`--line-height-${name}: ${scale.lineHeight}px;`);
    lines.push(`--font-weight-${name}: ${scale.weight};`);
  }

  return `:root {\n${lines.join("\n")}\n}`;
}

export function injectThemeVariables(): void {
  if (document.getElementById("kurtar-theme-tokens")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "kurtar-theme-tokens";
  styleEl.textContent = buildCssText();
  document.head.prepend(styleEl);
}
