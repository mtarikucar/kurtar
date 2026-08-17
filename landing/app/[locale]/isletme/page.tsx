import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata, buildFaqJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Receipt } from "@/components/Receipt";
import { Faq, type FaqItem } from "@/components/Faq";
import { MERCHANT_SIGNUP_URL } from "@/lib/site-config";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "merchants.meta" });
  return buildPageMetadata({
    locale,
    pathname: "/isletme",
    title: t("title"),
    description: t("description"),
  });
}

export default async function MerchantsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("merchants");

  const merchantSteps = t.raw("howItWorksForMerchants.steps") as { title: string; body: string }[];
  const faqItems = t.raw("faq.items") as FaqItem[];

  return (
    <>
      <JsonLd data={buildFaqJsonLd(faqItems)} />

      {/* Hero — the guarantee, stated plainly, with the CTA. */}
      <section className="kt-section">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("hero.eyebrow")}</p>
          <h1 style={{ fontSize: "44px", lineHeight: 1.1, marginTop: "var(--space-lg)", maxWidth: "20ch" }}>
            {t("hero.title")}
          </h1>
          <p style={{ marginTop: "var(--space-xl)", fontSize: "18px", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
            {t("hero.body")}
          </p>
          <div style={{ display: "flex", gap: "var(--space-lg)", marginTop: "var(--space-2xl)", flexWrap: "wrap" }}>
            <a href={MERCHANT_SIGNUP_URL} className="kt-btn kt-btn--primary">
              {t("hero.cta")}
            </a>
            <Link href="/nasil-calisir" className="kt-btn kt-btn--secondary">
              {t("hero.ctaSecondary")}
            </Link>
          </div>
        </div>
      </section>

      {/* Economics — the three numbers that answer "what do I earn, what do I pay". */}
      <section className="kt-section kt-section--kraft">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("economics.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("economics.title")}</h2>
          <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", maxWidth: "62ch" }}>
            {t("economics.body")}
          </p>
          <div
            style={{
              marginTop: "var(--space-2xl)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "var(--space-lg)",
            }}
          >
            <div className="kt-card">
              {/* ink-soft, not ink-faint (which would fail WCAG AA at this size on this light card) — overrides kt-footer__heading's own color, which assumes a dark background. */}
              <p className="kt-footer__heading" style={{ color: "var(--color-ink-soft)" }}>
                {t("economics.bagFeeTitle")}
              </p>
              <p className="kt-figure" style={{ fontSize: "24px", fontWeight: 700, marginTop: "var(--space-sm)" }}>
                {t("economics.bagFeeValue")}
              </p>
              <p style={{ marginTop: "var(--space-sm)", fontSize: "14px", color: "var(--color-ink-soft)" }}>
                {t("economics.bagFeeNote")}
              </p>
            </div>
            <div className="kt-card">
              {/* ink-soft, not ink-faint (which would fail WCAG AA at this size on this light card) — overrides kt-footer__heading's own color, which assumes a dark background. */}
              <p className="kt-footer__heading" style={{ color: "var(--color-ink-soft)" }}>
                {t("economics.membershipTitle")}
              </p>
              <p className="kt-figure" style={{ fontSize: "24px", fontWeight: 700, marginTop: "var(--space-sm)" }}>
                {t("economics.membershipValue")}
              </p>
              <p style={{ marginTop: "var(--space-sm)", fontSize: "14px", color: "var(--color-ink-soft)" }}>
                {t("economics.membershipNote")}
              </p>
            </div>
            <div className="kt-card">
              {/* ink-soft, not ink-faint (which would fail WCAG AA at this size on this light card) — overrides kt-footer__heading's own color, which assumes a dark background. */}
              <p className="kt-footer__heading" style={{ color: "var(--color-ink-soft)" }}>
                {t("economics.payoutTitle")}
              </p>
              <p className="kt-figure" style={{ fontSize: "24px", fontWeight: 700, marginTop: "var(--space-sm)", color: "var(--color-green-700)" }}>
                {t("economics.payoutValue")}
              </p>
              <p style={{ marginTop: "var(--space-sm)", fontSize: "14px", color: "var(--color-ink-soft)" }}>
                {t("economics.payoutNote")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Worked payout example — the signature receipt device. */}
      <section className="kt-section">
        <div className="kt-container" style={{ display: "flex", justifyContent: "center" }}>
          <Receipt
            title={t("receipt.title")}
            rows={[
              { label: t("receipt.grossLabel"), value: t("receipt.gross") },
              { label: t("receipt.feeLabel"), value: t("receipt.fee") },
              { label: t("receipt.withholdingLabel"), value: t("receipt.withholding") },
              { label: t("receipt.netLabel"), value: t("receipt.net"), total: true },
            ]}
            note={t("receipt.note")}
          />
        </div>
      </section>

      {/* Founding member offer. */}
      <section className="kt-section kt-section--ink">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("founding.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)" }}>{t("founding.title")}</h2>
          <p style={{ marginTop: "var(--space-lg)", color: "var(--color-line)", maxWidth: "60ch" }}>
            {t("founding.body")}
          </p>
          <ul style={{ display: "grid", gap: "var(--space-md)", marginTop: "var(--space-2xl)" }}>
            <li style={{ color: "var(--color-line)" }}>✓ {t("founding.bullet1")}</li>
            <li style={{ color: "var(--color-line)" }}>✓ {t("founding.bullet2")}</li>
            <li style={{ color: "var(--color-line)" }}>✓ {t("founding.bullet3")}</li>
          </ul>
          <a href={MERCHANT_SIGNUP_URL} className="kt-btn kt-btn--on-dark" style={{ marginTop: "var(--space-2xl)" }}>
            {t("founding.cta")}
          </a>
        </div>
      </section>

      {/* From application to first sale — genuinely sequential. */}
      <section className="kt-section kt-section--kraft">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("howItWorksForMerchants.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
            {t("howItWorksForMerchants.title")}
          </h2>
          <div className="kt-steps">
            {merchantSteps.map((step, index) => (
              <div className="kt-step" key={step.title}>
                <span className="kt-step__index kt-figure">{index + 1}</span>
                <div>
                  <h3 style={{ fontSize: "18px" }}>{step.title}</h3>
                  <p style={{ marginTop: "var(--space-xs)", color: "var(--color-ink-soft)" }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — real objections, answered plainly. */}
      <section className="kt-section">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("faq.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
            {t("faq.title")}
          </h2>
          <Faq items={faqItems} />
        </div>
      </section>

      {/* Final CTA. */}
      <section className="kt-section kt-section--kraft">
        <div className="kt-container" style={{ textAlign: "center" }}>
          <h2>{t("finalCta.title")}</h2>
          <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)", maxWidth: "56ch", marginInline: "auto" }}>
            {t("finalCta.body")}
          </p>
          <a href={MERCHANT_SIGNUP_URL} className="kt-btn kt-btn--primary" style={{ marginTop: "var(--space-2xl)" }}>
            {t("finalCta.cta")}
          </a>
        </div>
      </section>
    </>
  );
}
