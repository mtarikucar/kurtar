"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LOCALE_LABELS } from "@/lib/site-config";

/**
 * The one small client-side island in the nav — `usePathname()` (next/
 * navigation, which next-intl's wrapper is itself built on) only works in
 * a Client Component, and reading the CURRENT pathname is exactly what
 * lets this switcher preserve the page across a locale switch: handing
 * that same locale-neutral pathname to `<Link locale={other}>` for every
 * locale is what makes "switch language on /isletme" land on the
 * correctly-localized URL for /isletme, not the home page. Every other
 * component on the site stays a Server Component; see
 * test/locale-switcher.test.ts for the pure-function version of this same
 * path-preservation guarantee (`getPathname`, no rendering required).
 */
export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const activeLocale = useLocale();
  const pathname = usePathname();

  return (
    <nav className="kt-locale-switcher" aria-label={t("label")}>
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          aria-current={locale === activeLocale ? "true" : undefined}
        >
          {locale.toUpperCase()}
          <span className="kt-visually-hidden">{LOCALE_LABELS[locale]}</span>
        </Link>
      ))}
    </nav>
  );
}
