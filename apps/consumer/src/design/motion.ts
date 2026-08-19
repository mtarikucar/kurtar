import { Easing, Platform } from "react-native";

/**
 * Motion curves for the duration tokens in tokens.ts (spec §1.3).
 *
 * `useNativeDriver` is off on web only: react-native-web has no native
 * animated module, and asking for one there produces a console warning per
 * animation — on the review screen, one per card.
 */
export const YERLI_SURUCU = Platform.OS !== "web";

export const egri = {
  /** m.fast — map pin selection, chip state. */
  fast: Easing.bezier(0.2, 0, 0, 1),
  /** m.base — card shutter entry, sheet content. */
  base: Easing.bezier(0.2, 0, 0, 1),
  /** m.snap — shutter position update on the 60s tick. */
  snap: Easing.out(Easing.quad),
  /** m.roll — the kepenk roll (redeem, purchase). */
  roll: Easing.bezier(0.16, 0.84, 0.3, 1),
  /** m.flood — the handover light flood. */
  flood: Easing.out(Easing.cubic),
  /** m.phase — day↔night palette cross-fade overlay. */
  phase: Easing.linear,
} as const;
