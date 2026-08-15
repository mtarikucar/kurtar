/**
 * @kurtar/ui-tokens — shared design tokens for every kurtar frontend
 * surface (apps/merchant-web, apps/admin-web, apps/consumer, landing).
 *
 * Plain TypeScript constants only: no CSS, no CSS-in-JS runtime, no DOM
 * globals, no React Native imports. This file must load identically in a
 * browser bundle (Vite/Next), in Metro/Hermes (Expo), and in plain Node
 * (e.g. a script or test) — importing anything platform-specific here
 * would break one of those three runtimes for everyone.
 */
export { colors, kurtarOrange, rescueGreen, semantic, neutral } from "./colors";
export type { ColorRamp } from "./colors";
export { spacing, radii } from "./spacing";
export { typeScale } from "./typography";
export type { TypeScaleToken } from "./typography";
