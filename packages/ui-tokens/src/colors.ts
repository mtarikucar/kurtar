/**
 * Brand palette for kurtar — a surplus-food marketplace (TGTG-style) for
 * Turkey. Every consumer of this file (apps/merchant-web, apps/admin-web,
 * apps/consumer, landing) imports the SAME constants, so the three
 * customer-facing surfaces read as one product even though they are three
 * separate codebases built by three separate app tasks.
 *
 * Rationale for the two brand hues:
 *  - PRIMARY ("kurtarOrange") is a warm, appetising tomato/sunset orange.
 *    Food marketplaces lean on warm hues because they read as appetising
 *    (the same reason menus and food photography skew warm) and because
 *    orange carries urgency without being alarming — apt for a product
 *    whose whole premise is "this surplus bag disappears at closing time".
 *  - SECONDARY ("rescueGreen") is a deep, confident forest green — the
 *    "rescued / eco" signal: sustainability, food-waste reduction, the
 *    impact numbers (kg saved, CO2e avoided) the app surfaces back to
 *    consumers. Green is used deliberately LESS than orange (secondary,
 *    not primary) so it reads as "impact accent", not as the base brand
 *    hue — that would compete with the appetite signal orange is there
 *    to give.
 *
 * Each ramp runs 50 (near-white tint) -> 900 (near-black shade) so every
 * surface can pick the right contrast step for its own background
 * (light-mode card, dark-mode nav bar, a pressed-state fill, etc.)
 * without inventing its own shade of the brand color.
 */

/** Warm, appetising primary — CTAs, brand marks, the "reserve this bag" action. */
export const kurtarOrange = {
  50: "#FFF4EE",
  100: "#FFE4D3",
  200: "#FFC5A3",
  300: "#FF9F6B",
  400: "#FA7A42",
  500: "#F2542D", // base — primary brand color, default button fill
  600: "#D93F1C",
  700: "#B22F14",
  800: "#8A2510",
  900: "#5C190A",
} as const;

/** "Rescued / eco" secondary — impact stats, sustainability badges, success framing tied to the mission (distinct from the generic `success` semantic below). */
export const rescueGreen = {
  50: "#EBF7EF",
  100: "#CDEBD7",
  200: "#9BD7B0",
  300: "#63BE86",
  400: "#379F63",
  500: "#1F7A46", // base — secondary brand color, impact/eco accents
  600: "#166138",
  700: "#0F4A2B",
  800: "#0A331E",
  900: "#051D11",
} as const;

/**
 * Semantic colors — status/feedback, deliberately NOT reused from the two
 * brand hues above (a warning must never read as "this is just the brand
 * orange") so a screen can mix a brand-orange CTA with an amber warning
 * banner and the two stay visually distinct.
 */
export const semantic = {
  /** Confirmed / completed states (e.g. "reservation confirmed", "settlement paid"). */
  success: {
    50: "#EAFBF1",
    500: "#1FA35C",
    700: "#136B3D",
  },
  /** Needs attention but not broken (e.g. "pickup window closes in 10 min", "membership renews soon"). */
  warning: {
    50: "#FFF8E6",
    500: "#E0A600",
    700: "#8A6600",
  },
  /** Failure / destructive / blocking (e.g. reservation cancelled, complaint escalated, form validation error). */
  danger: {
    50: "#FDECEC",
    500: "#D93A3A",
    700: "#9A2323",
  },
  /** Informational, neutral-toned notices (e.g. "your OTP was resent"). */
  info: {
    50: "#EAF2FE",
    500: "#2D6FE0",
    700: "#1B4A9E",
  },
} as const;

/**
 * Neutral ramp — text, borders, surfaces, disabled states. Slightly warm
 * (not pure gray) so it sits comfortably next to kurtarOrange instead of
 * reading cold/clinical against a warm brand hue.
 */
export const neutral = {
  0: "#FFFFFF",
  50: "#FAF9F7",
  100: "#F2F0EC",
  200: "#E4E1DA",
  300: "#CFCABE",
  400: "#A89F8E",
  500: "#7D7566",
  600: "#5C5548",
  700: "#413C33",
  800: "#2A2620",
  900: "#161410",
  1000: "#000000",
} as const;

export const colors = {
  primary: kurtarOrange,
  secondary: rescueGreen,
  semantic,
  neutral,
} as const;

export type ColorRamp = typeof kurtarOrange;
