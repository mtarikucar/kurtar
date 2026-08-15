/**
 * Type scale. `size` and `lineHeight` are plain numbers (logical
 * px on web, dp on React Native — same "no unit suffix" rule as
 * spacing.ts). `weight` is a CSS/React-Native-compatible numeric font
 * weight string, which both `font-weight` (web) and RN's `fontWeight`
 * style prop accept identically.
 *
 * Font FAMILY is deliberately NOT specified here — each app registers its
 * own platform-appropriate font (system font stack on web, a loaded
 * expo-font on the Expo app) since font loading is a per-platform concern
 * this framework-free package must not assume.
 */
export const typeScale = {
  display: { size: 32, lineHeight: 40, weight: "700" },
  h1: { size: 26, lineHeight: 34, weight: "700" },
  h2: { size: 22, lineHeight: 28, weight: "600" },
  h3: { size: 18, lineHeight: 24, weight: "600" },
  body: { size: 16, lineHeight: 24, weight: "400" },
  bodyStrong: { size: 16, lineHeight: 24, weight: "600" },
  caption: { size: 13, lineHeight: 18, weight: "400" },
  label: { size: 12, lineHeight: 16, weight: "600" },
} as const;

export type TypeScaleToken = keyof typeof typeScale;
