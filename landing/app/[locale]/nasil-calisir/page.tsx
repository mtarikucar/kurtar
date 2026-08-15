import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { Receipt } from "@/components/Receipt";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howItWorks.meta" });
  return buildPageMetadata({
    locale,
    pathname: "/nasil-calisir",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HowItWorksPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("howItWorks");

  const steps = t.raw("steps.items") as { title: string; body: string }[];
  const honestyItems = t.raw("honesty.items") as { title: string; body: string }[];

  return (
    <>
      <section className="kt-section">
        <div className="kt-container">
          <p className="kt-eyebrow">{t("hero.eyebrow")}</p>
          <h1 style={{ fontSize: "38px", marginTop: "var(--space-lg)", maxWidth: "24ch" }}>
            {t("hero.title")}
          </h1>
          <p style={{ marginTop: "var(--space-lg)", fontSize: "18px", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
            {t("hero.body")}
          </p>
        </div>
      </section>

      <section className="kt-section kt-section--kraft">
        <div className="kt-container" style={{ display: "grid", gap: "var(--space-5xl)", gridTemplateColumns: "1.1fr 0.9fr", alignItems: "start" }}>
          <div>
            <p className="kt-eyebrow">{t("steps.eyebrow")}</p>
            <h2 style={{ marginTop: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
              {t("steps.title")}
            </h2>
            <div className="kt-steps">
              {steps.map((step, index) => (
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
          <div style={{ position: "sticky", top: "96px" }}>
            <Receipt
              title={t("receipt.title")}
              rows={[
                { label: t("receipt.valueLabel"), value: t("receipt.value") },
                { label: t("receipt.priceLabel"), value: t("receipt.price") },
                { label: t("receipt.savedLabel"), value: t("receipt.saved"), total: true },
              ]}
              note={t("receipt.note")}
            />
          </div>
        </div>
      </section>

      <section className="kt-section">
        <div className="kt-container">
          <p className="kt-eyebrow kt-eyebrow--green">{t("honesty.eyebrow")}</p>
          <h2 style={{ marginTop: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
            {t("honesty.title")}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "var(--space-lg)",
            }}
          >
            {honestyItems.map((item) => (
              <div key={item.title} className="kt-card">
                <h3 style={{ fontSize: "17px" }}>{item.title}</h3>
                <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", fontSize: "15px" }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="kt-section kt-section--ink">
        <div className="kt-container" style={{ textAlign: "center" }}>
          <h2>{t("faqCta.title")}</h2>
          <p style={{ marginTop: "var(--space-md)", color: "var(--color-line)", maxWidth: "56ch", marginInline: "auto" }}>
            {t("faqCta.body")}
          </p>
          <Link href="/isletme" className="kt-btn kt-btn--on-dark" style={{ marginTop: "var(--space-2xl)" }}>
            {t("faqCta.cta")}
          </Link>
        </div>
      </section>
    </>
  );
}
