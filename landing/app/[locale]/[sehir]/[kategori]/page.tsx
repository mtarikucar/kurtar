import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata, buildBreadcrumbJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Receipt } from "@/components/Receipt";
import { cities, getCity } from "@/content/cities";
import { categories, getCategory } from "@/content/categories";
import { buildIntro } from "@/content/programmatic";
import { formatMoneyCents } from "@/lib/format";
import { routing, type AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale; sehir: string; kategori: string }>;
}

/**
 * Exactly the curated 4 cities x 5 categories = 20 combinations (task-13
 * brief: "a curated set") — no other city/category slug renders a page.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    cities.flatMap((city) =>
      categories.map((category) => ({ locale, sehir: city.slug, kategori: category.slug })),
    ),
  );
}

// Any combination outside the curated set 404s instead of being rendered
// on demand — deliberate: an uncurated programmatic page is exactly the
// kind of thin/duplicate content this brief warns against.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, sehir, kategori } = await params;
  const city = getCity(sehir);
  const category = getCategory(kategori);
  if (!city || !category) return {};

  const t = await getTranslations({ locale, namespace: "programmatic.meta" });
  const districts = city.neighbourhoods[locale].slice(0, 2).join(locale === "tr" ? " ve " : " and ");

  return buildPageMetadata({
    locale,
    pathname: `/${sehir}/${kategori}`,
    title: t("titleTemplate", { category: category.name[locale], city: city.name[locale] }),
    description: t("descriptionTemplate", {
      city: city.name[locale],
      districts,
      categoryLower: category.nameLower[locale],
    }),
  });
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { locale, sehir, kategori } = await params;
  const city = getCity(sehir);
  const category = getCategory(kategori);
  if (!city || !category) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("programmatic");
  const intro = buildIntro(city, category, locale);

  const otherCategories = categories.filter((c) => c.slug !== category.slug);
  const otherCities = cities.filter((c) => c.slug !== city.slug);

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: t("breadcrumbHome"), url: "/" },
          { name: city.name[locale], url: `/${city.slug}/${category.slug}` },
          { name: category.name[locale], url: `/${city.slug}/${category.slug}` },
        ])}
      />

      <nav aria-label={t("breadcrumbLabel")} style={{ padding: "var(--space-lg) 0 0" }}>
        <div className="kt-container" style={{ fontSize: "13px", color: "var(--color-ink-soft)" }}>
          <Link href="/">{t("breadcrumbHome")}</Link> / {city.name[locale]} / {category.name[locale]}
        </div>
      </nav>

      <section className="kt-section">
        <div className="kt-container" style={{ display: "grid", gap: "var(--space-5xl)", gridTemplateColumns: "1.1fr 0.9fr", alignItems: "start" }}>
          <div>
            <p className="kt-eyebrow">
              {city.name[locale]} · {category.name[locale]}
            </p>
            <h1 style={{ marginTop: "var(--space-lg)", fontSize: "36px", maxWidth: "22ch" }}>
              {category.name[locale]} — {city.name[locale]}
            </h1>
            <p style={{ marginTop: "var(--space-xl)", fontSize: "17px", color: "var(--color-ink-soft)", maxWidth: "62ch" }}>
              {intro}
            </p>
            <p style={{ marginTop: "var(--space-lg)", color: "var(--color-ink-soft)", maxWidth: "62ch" }}>
              {category.typicalContents[locale]}
            </p>
            <p style={{ marginTop: "var(--space-lg)", fontSize: "14px", color: "var(--color-ink-soft)", maxWidth: "62ch" }}>
              {category.fact[locale]}
            </p>
          </div>
          <Receipt
            title={`${category.name[locale]} — ${city.name[locale]}`}
            rows={[
              {
                label: locale === "tr" ? "İçerik değeri" : "Contents value",
                value: `${formatMoneyCents(category.valueRangeCents[0], locale)} – ${formatMoneyCents(category.valueRangeCents[1], locale)}`,
              },
              {
                label: locale === "tr" ? "Başlangıç fiyatı" : "Starting price",
                value: formatMoneyCents(category.startingPriceCents, locale),
                total: true,
              },
            ]}
          />
        </div>
      </section>

      <section className="kt-section kt-section--kraft" style={{ textAlign: "center" }}>
        <div className="kt-container">
          {/* The consumer app isn't live yet (see lib/site-config.ts's
              APP_LINKS placeholder note) — this links to the home page's
              download section rather than a dead "#" href or a fake deep
              link into an app that doesn't exist. */}
          <Link href={{ pathname: "/", hash: "app-download" }} className="kt-btn kt-btn--primary">
            {t("cta", { city: city.name[locale], category: category.nameLower[locale] })}
          </Link>
        </div>
      </section>

      <section className="kt-section">
        <div className="kt-container" style={{ display: "grid", gap: "var(--space-5xl)", gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <h2 style={{ fontSize: "20px" }}>{t("otherCategoriesTitle", { city: city.name[locale] })}</h2>
            <ul style={{ marginTop: "var(--space-lg)", display: "grid", gap: "var(--space-sm)" }}>
              {otherCategories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/${city.slug}/${c.slug}`}>{c.name[locale]}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 style={{ fontSize: "20px" }}>{t("otherCitiesTitle")}</h2>
            <ul style={{ marginTop: "var(--space-lg)", display: "grid", gap: "var(--space-sm)" }}>
              {otherCities.map((c) => (
                <li key={c.slug}>
                  <Link href={`/${c.slug}/${category.slug}`}>{c.name[locale]}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
