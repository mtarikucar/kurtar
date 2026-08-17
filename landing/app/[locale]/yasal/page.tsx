import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { legalDocuments } from "@/content/legal";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legalIndex.meta" });
  return buildPageMetadata({
    locale,
    pathname: "/yasal",
    title: t("title"),
    description: t("description"),
  });
}

export default async function LegalIndexPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legalIndex");

  return (
    <section className="kt-section">
      <div className="kt-container">
        <h1>{t("title")}</h1>
        <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
          {t("body")}
        </p>
        <ul style={{ marginTop: "var(--space-2xl)", display: "grid", gap: "var(--space-lg)" }}>
          {legalDocuments.map((doc) => (
            <li key={doc.slug} className="kt-card">
              <Link href={`/yasal/${doc.slug}`} style={{ fontWeight: 700, fontSize: "17px" }}>
                {doc.title[locale]}
              </Link>
              <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)", fontSize: "15px" }}>
                {doc.description[locale]}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
