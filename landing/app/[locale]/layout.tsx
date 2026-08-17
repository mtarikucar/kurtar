import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-config";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.meta" });

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("title"),
      template: `%s — kurtar`,
    },
    description: t("description"),
    // No manual `icons` field — app/icon.svg (Next's file-convention
    // favicon) is auto-detected and injected; app/favicon.ico is kept
    // alongside it as the legacy fallback for browsers/bookmarks that
    // still expect that exact filename.
    // Smart app banner (task-13 brief) — apple-itunes-app meta tag, with a
    // clearly-placeholder App Store ID until apps/consumer actually ships
    // (see lib/site-config.ts's APP_LINKS doc comment).
    other: {
      "apple-itunes-app": "app-id=0000000000",
    },
  };
}

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this request (next-intl's own
  // requirement for `generateStaticParams` + Server Components to
  // actually produce static HTML instead of falling back to dynamic
  // rendering per request).
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
