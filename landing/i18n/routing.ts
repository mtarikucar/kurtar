import { defineRouting } from "next-intl/routing";

/**
 * The two locales this site ships (task-13 brief: "tr (default) + en").
 * Turkish carries no URL prefix ("/isletme") since it is the primary
 * voice and the overwhelming majority of traffic; English sits under
 * "/en" ("/en/isletme") — `localePrefix: "as-needed"` is what gives the
 * default locale a bare path while every other locale gets prefixed.
 */
export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
