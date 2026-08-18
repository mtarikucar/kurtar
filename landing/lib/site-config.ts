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
 * [I10 fix] Where the /isletme page's "list your business" CTAs send
 * merchants — this is landing's entire commercial purpose. Was
 * `/signup`, a path apps/merchant-web has never had: every route in that
 * app is Turkish (apps/merchant-web/src/routes.ts), and its real signup
 * route is `/kayit`. `/signup` matched merchant-web's catch-all
 * (App.tsx's RootRedirect), which sends an unauthenticated visitor to
 * `/giris` (the LOGIN form) — so every founding-member/CTA click sent a
 * brand-new bakery owner who has never had an account to a login screen
 * asking for credentials they don't have.
 */
export const MERCHANT_SIGNUP_URL =
  process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:5173/kayit";

/**
 * Placeholder store/app identifiers — task-13 brief: "App store badges
 * (placeholders until the apps ship — make them clearly swappable)" and
 * "Smart app banners: apple-itunes-app meta + Android intent handling
 * (placeholder IDs, clearly marked)". `iosAppStoreId`/`iosAppStoreUrl` and
 * `androidPlayStoreUrl` stay deliberate, obviously-fake placeholders until
 * the apps actually have store listings — grep for PLACEHOLDER once they
 * do and replace those in one pass. `androidPackageName` is NOT a
 * placeholder [M4 fix]: apps/consumer/app.json already declares the real
 * package (`expo.android.package`), and OfferAppOpener.tsx builds the
 * Android `intent://` deep link directly from this constant — a
 * placeholder package name there can never match an installed app, so
 * the intent silently falls through to the Play Store fallback URL for
 * every Android visitor, even with the app installed.
 */
export const APP_LINKS = {
  /** Real value looks like "id1234567890" once App Store Connect issues one. */
  iosAppStoreId: "id0000000000",
  iosAppStoreUrl: "https://apps.apple.com/tr/app/kurtar/id0000000000",
  androidPackageName: "app.kurtar.consumer",
  androidPlayStoreUrl:
    "https://play.google.com/store/apps/details?id=app.kurtar.consumer.PLACEHOLDER",
  /** Custom URL scheme apps/consumer registers for universal-link fallback deep links. */
  deepLinkScheme: "kurtar",
} as const;
