import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on every path except Next internals, static files, and the
  // .well-known directory (Apple/Android universal-link verification
  // files, which must be served byte-for-byte from `public/.well-known`
  // with no locale prefix or redirect in front of them) and
  // sitemap/robots (also locale-agnostic, top-level app/ routes).
  matcher: [
    "/((?!api|_next|_vercel|.well-known|sitemap\\.xml|robots\\.txt|.*\\..*).*)",
  ],
};
