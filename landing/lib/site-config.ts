/**
 * Site-wide constants that don't belong to any one page: canonical origin
 * (for absolute URLs in metadata/sitemap/JSON-LD), locale display names,
 * and the placeholder store-badge/app-scheme identifiers task-13's brief
 * explicitly asks to keep "clearly swappable" until the app actually ships.
 */

/**
 * The origin `sitemap.ts`/`robots.ts`/metadata's `metadataBase` build
 * absolute URLs from. Falls back to the production domain reserved in the
 * master plan (docs/plans/2026-08-12-kurtar-master-plan.md §5.5) — a
 * build must never crash for lack of this var, but a real deploy should
 * always set NEXT_PUBLIC_SITE_URL explicitly.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://kurtar.app";

export const LOCALE_LABELS: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
};

/**
 * Where the /isletme page's "list your business" CTAs send merchants —
 * apps/merchant-web (Task 10) is a sibling app task building in parallel
 * and its signup route isn't discoverable from here yet, so this points
 * at its dev origin (docs/frontend-contract.md's port table: merchant-web
 * dev is fixed at :5173) with a `/signup` path that matches the client
 * contract's `client.merchant.signup(...)` operation. Update this env
 * var once merchant-web's real signup route and production origin exist.
 */
export const MERCHANT_SIGNUP_URL =
  process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:5173/signup";

/**
 * Placeholder store/app identifiers — task-13 brief: "App store badges
 * (placeholders until the apps ship — make them clearly swappable)" and
 * "Smart app banners: apple-itunes-app meta + Android intent handling
 * (placeholder IDs, clearly marked)". Every value below is a deliberate,
 * obviously-fake placeholder (never a real Apple/Google identifier) — grep
 * for PLACEHOLDER when the consumer app (apps/consumer) actually ships and
 * replace every one of these in one pass.
 */
export const APP_LINKS = {
  /** Real value looks like "id1234567890" once App Store Connect issues one. */
  iosAppStoreId: "id0000000000",
  iosAppStoreUrl: "https://apps.apple.com/tr/app/kurtar/id0000000000",
  /** Real value is the published package name, e.g. "app.kurtar.consumer". */
  androidPackageName: "app.kurtar.consumer.PLACEHOLDER",
  androidPlayStoreUrl:
    "https://play.google.com/store/apps/details?id=app.kurtar.consumer.PLACEHOLDER",
  /** Custom URL scheme apps/consumer registers for universal-link fallback deep links. */
  deepLinkScheme: "kurtar",
} as const;
