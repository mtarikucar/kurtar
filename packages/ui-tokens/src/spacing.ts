/**
 * Spacing scale — an 4px base unit, doubling/stepping the way most
 * mobile+web hybrid design systems do so a merchant-web card's padding and
 * a consumer-app screen's margin come from the same rhythm.
 *
 * Values are PLAIN NUMBERS, not CSS strings ("16", not "16px") — on web,
 * a consumer appends "px" (or feeds the number straight to a CSS-in-JS
 * lib that treats numbers as px); on React Native, a number IS the unit
 * (density-independent pixels), so no per-platform branching is needed
 * here. Never import this file expecting pre-unit-suffixed strings.
 */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;

/**
 * Corner radii. `full` is a deliberately large number (not `9999px`-style
 * string — see the spacing note above) so a consumer can use it directly
 * as a numeric radius on a pill-shaped element of any size on both web and
 * RN `borderRadius`.
 */
export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 999,
} as const;
