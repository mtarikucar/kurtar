import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";
import { SITE_URL } from "@/lib/site-config";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

interface PageMetadataInput {
  locale: string;
  /** Locale-neutral internal pathname, e.g. "/isletme". */
  pathname: string;
  title: string;
  description: string;
  type?: "website" | "article";
}

/**
 * The one metadata builder every page's `generateMetadata` goes through —
 * gives every page the same title template, canonical URL (locale-correct,
 * via getPathname), hreflang alternates, and OG/Twitter card shape, so no
 * individual page can forget one of those fields. See test/seo.test.ts for
 * the unit coverage (locale routing correctness, per-page-type shape).
 *
 * Deliberately does NOT set `openGraph.images`/`twitter.images` — Next's
 * file-convention `app/[locale]/opengraph-image.tsx` generates a real PNG
 * (via `next/og`'s ImageResponse) and auto-injects the correct meta tags
 * for every page under that segment; setting `images` here would either
 * duplicate or silently override that per Next's metadata-merging rules.
 */
export function buildPageMetadata({
  locale,
  pathname,
  title,
  description,
  type = "website",
}: PageMetadataInput): Metadata {
  const canonicalPath = getPathname({
    locale: locale as (typeof routing.locales)[number],
    href: pathname,
  });
  const canonical = absoluteUrl(canonicalPath);

  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = absoluteUrl(getPathname({ locale: loc, href: pathname }));
  }
  languages["x-default"] = absoluteUrl(
    getPathname({ locale: routing.defaultLocale, href: pathname }),
  );

  // app/[locale]/layout.tsx sets a root `title.template` of "%s — kurtar"
  // so every page gets a consistent brand suffix without repeating it in
  // every messages.json title string. A handful of titles (home, /isletme)
  // deliberately use "kurtar" mid-sentence as the brand's own wordplay
  // ("kurtar" is also the imperative Turkish verb "rescue!") — applying
  // the template to those would double the brand mention ("... kurtar —
  // kurtar"). `title.absolute` is Next's documented escape hatch for
  // exactly this: an exact title string the layout's template never
  // wraps.
  const titleField = title.toLowerCase().includes("kurtar") ? { absolute: title } : title;

  return {
    title: titleField,
    description,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "kurtar",
      locale: locale === "tr" ? "tr_TR" : "en_US",
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** schema.org Organization — used once, on the home page. */
export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "kurtar",
    url: SITE_URL,
    logo: absoluteUrl("/icon.svg"),
    description:
      "kurtar, Türkiye'de gün sonunda satılamayan fazla gıdayı işletmelerden tüketiciye indirimli sürpriz paket olarak ulaştıran pazaryeri.",
    sameAs: [],
  };
}

/** schema.org FAQPage — used on /isletme (and any other page with a real, rendered FAQ list). */
export function buildFaqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/** schema.org BreadcrumbList — used on the programmatic şehir/kategori pages. */
export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

/** schema.org Article — used on blog posts. */
export function buildArticleJsonLd(params: {
  headline: string;
  description: string;
  datePublished: string;
  pathname: string;
  locale: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.headline,
    description: params.description,
    datePublished: params.datePublished,
    inLanguage: params.locale,
    mainEntityOfPage: absoluteUrl(
      getPathname({
        locale: params.locale as (typeof routing.locales)[number],
        href: params.pathname,
      }),
    ),
    publisher: {
      "@type": "Organization",
      name: "kurtar",
    },
  };
}
