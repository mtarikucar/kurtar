import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata, buildOrganizationJsonLd } from "@/lib/seo";
import { getPublicImpact } from "@/lib/impact";
import { JsonLd } from "@/components/JsonLd";
import { ImpactCounter } from "@/components/ImpactCounter";
import { Receipt } from "@/components/Receipt";
import { categories } from "@/content/categories";
import { formatMoneyCents } from "@/lib/format";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.meta" });
  return buildPageMetadata({
    locale,
    pathname: "/",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const impactData = await getPublicImpact();

  const heroSteps = t.raw("howItWorks.steps") as { title: string; body: string }[];

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />

      {/* Hero — the thesis: a worked price example (the site's signature
          "fiş" device), not a generic stat block, opens the page. */}
      <section className="kt-section">
        <div className="kt-container" style={{ display: "grid", gap: "var(--space-5xl)", gridTemplateColumns: "1.1fr 0.9fr", alignItems: "center" }}>
          <div>
            <p className="kt-eyebrow">{t("hero.eyebrow")}</p>
            <h1 style={{ fontSize: "44px", lineHeight: 1.1, marginTop: "var(--space-lg)" }}>
              {t("hero.title")}
            </h1>
            <p style={{ marginTop: "var(--space-xl)", fontSize: "18px", color: "var(--color-ink-soft)", maxWidth: "56ch" }}>
              {t("hero.body")}
            </p>
            <div style={{ display: "flex", gap: "var(--space-lg)", marginTop: "var(--space-2xl)", flexWrap: "wrap" }}>
              <Link href="/nasil-calisir" className="kt-btn kt-btn--primary">
                {t("hero.ctaConsumer")}
              </Link>
              <Link href="/isletme" className="kt-btn kt-btn--secondary">
                {t("hero.ctaMerchant")}
              </Link>
            </div>
          </div>
          <div>
            <Receipt
              title={t("hero.receiptTitle")}
              rows={[
                { label: t("hero.receiptValueLabel"), value: t("hero.receiptValue") },
                { label: t("hero.receiptPriceLabel"), value: t("hero.receiptPrice") },
                { label: t("hero.receiptSavedLabel"), value: t("hero.receiptSaved"), total: true },
              ]}
              note={t("hero.receiptNote")}
            />
          </div>
        </div>
      </section>

      {/* Impact — proof strip, not the hero move; degrades gracefully. */}
      <section className="kt-section kt-section--kraft">
        <div className="kt-container">
          <p className="kt-eyebrow kt-eyebrow--green">{t("impact.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("impact.title")}</h2>
          <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
            {t("impact.body")}
          </p>
          <div style={{ marginTop: "var(--space-2xl)" }}>
            <ImpactCounter
              data={impactData}
              locale={locale}
              labels={{
                mealsSaved: t("impact.mealsSaved"),
                co2eAvoided: t("impact.co2eAvoided"),
                moneySaved: t("impact.moneySaved"),
                unavailableTitle: t("impact.unavailableTitle"),
                unavailableBody: t("impact.unavailableBody"),
              }}
            />
          </div>
        </div>
      </section>

      {/* Categories — five kinds of businesses, five kinds of surprises. */}
      <section className="kt-section">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("categories.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("categories.title")}</h2>
          <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
            {t("categories.body")}
          </p>
          <div
            style={{
              marginTop: "var(--space-2xl)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--space-lg)",
            }}
          >
            {categories.map((category) => (
              <div key={category.slug} className="kt-card">
                <h3 style={{ fontSize: "19px" }}>{category.name[locale]}</h3>
                <p className="kt-figure" style={{ marginTop: "var(--space-sm)", color: "var(--color-orange-700)", fontWeight: 700 }}>
                  {formatMoneyCents(category.startingPriceCents, locale)}+
                </p>
                <p style={{ marginTop: "var(--space-sm)", fontSize: "14px", color: "var(--color-ink-soft)" }}>
                  {category.hook[locale]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works teaser — genuinely sequential, numbering justified. */}
      <section className="kt-section kt-section--kraft">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("howItWorks.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("howItWorks.title")}</h2>
          <div className="kt-steps" style={{ marginTop: "var(--space-2xl)" }}>
            {heroSteps.map((step, index) => (
              <div className="kt-step" key={step.title}>
                <span className="kt-step__index kt-figure">{index + 1}</span>
                <div>
                  <h3 style={{ fontSize: "18px" }}>{step.title}</h3>
                  <p style={{ marginTop: "var(--space-xs)", color: "var(--color-ink-soft)" }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/nasil-calisir" className="kt-btn kt-btn--secondary" style={{ marginTop: "var(--space-2xl)" }}>
            {t("howItWorks.cta")}
          </Link>
        </div>
      </section>

      {/* Merchant teaser — the highest-value CTA on the site. */}
      <section className="kt-section kt-section--ink">
        <div className="kt-container" style={{ display: "grid", gap: "var(--space-2xl)", gridTemplateColumns: "1.2fr 0.8fr", alignItems: "start" }}>
          <div>
            <p className="kt-eyebrow">{t("merchantTeaser.eyebrow")}</p>
            <h2 style={{ marginTop: "var(--space-md)" }}>{t("merchantTeaser.title")}</h2>
            <p style={{ marginTop: "var(--space-lg)", color: "var(--color-line)", maxWidth: "56ch" }}>
              {t("merchantTeaser.body")}
            </p>
            <Link href="/isletme" className="kt-btn kt-btn--on-dark" style={{ marginTop: "var(--space-2xl)" }}>
              {t("merchantTeaser.cta")}
            </Link>
          </div>
          <ul style={{ display: "grid", gap: "var(--space-lg)" }}>
            <li style={{ color: "var(--color-line)" }}>✓ {t("merchantTeaser.bullet1")}</li>
            <li style={{ color: "var(--color-line)" }}>✓ {t("merchantTeaser.bullet2")}</li>
            <li style={{ color: "var(--color-line)" }}>✓ {t("merchantTeaser.bullet3")}</li>
          </ul>
        </div>
      </section>

      {/* App download — placeholders, clearly swappable. */}
      <section className="kt-section" id="app-download">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("appDownload.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("appDownload.title")}</h2>
          <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", maxWidth: "56ch" }}>
            {t("appDownload.body")}
          </p>
          <p style={{ marginTop: "var(--space-lg)", fontSize: "13px", color: "var(--color-ink-soft)" }}>
            {t("appDownload.comingSoonNote")}
          </p>
        </div>
      </section>
    </>
  );
}
