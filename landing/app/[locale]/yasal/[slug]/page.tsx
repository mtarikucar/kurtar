import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { legalDocuments, getLegalDocument } from "@/content/legal";
import { routing, type AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale; slug: string }>;
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    legalDocuments.map((doc) => ({ locale, slug: doc.slug })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const doc = getLegalDocument(slug);
  if (!doc) return {};
  return buildPageMetadata({
    locale,
    pathname: `/yasal/${slug}`,
    title: doc.title[locale],
    description: doc.description[locale],
  });
}

export default async function LegalDocumentPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const doc = getLegalDocument(slug);
  if (!doc) notFound();

  const intro = doc.intro[locale];
  const blocks = doc.blocks[locale];

  return (
    <section className="kt-section">
      <div className="kt-container">
        <div className="kt-prose">
          <p className="kt-eyebrow">{doc.versionLabel[locale]}</p>
          <h1 style={{ marginTop: "var(--space-lg)" }}>{doc.title[locale]}</h1>
          {intro.map((paragraph, index) => (
            <p key={index} style={{ marginTop: index === 0 ? "var(--space-xl)" : undefined }}>
              {paragraph}
            </p>
          ))}
          {blocks.map((block, index) => (
            <div key={block.heading ?? index}>
              {block.heading ? <h2>{block.heading}</h2> : null}
              {block.paragraphs.map((paragraph, pIndex) => (
                <p key={pIndex}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
