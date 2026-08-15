import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { buildPageMetadata, buildArticleJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { blogPosts, getBlogPost, type BlogBlock } from "@/content/blog/posts";
import { routing, type AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale; slug: string }>;
}

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    blogPosts.map((post) => ({ locale, slug: post.slug })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return buildPageMetadata({
    locale,
    pathname: `/blog/${slug}`,
    title: post.title[locale],
    description: post.description[locale],
    type: "article",
  });
}

const DATE_FORMATTERS: Record<AppLocale, Intl.DateTimeFormat> = {
  tr: new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }),
};

function renderBlock(block: BlogBlock, index: number) {
  if (block.type === "h2") return <h2 key={index}>{block.text}</h2>;
  if (block.type === "ul") {
    return (
      <ul key={index}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p key={index}>{block.text}</p>;
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = getBlogPost(slug);
  if (!post) notFound();
  const common = await getTranslations("common");

  return (
    <>
      <JsonLd
        data={buildArticleJsonLd({
          headline: post.title[locale],
          description: post.description[locale],
          datePublished: post.publishedAt,
          pathname: `/blog/${slug}`,
          locale,
        })}
      />
      <article className="kt-section">
        <div className="kt-container">
          <div className="kt-prose">
            {/* ink-soft, not ink-faint: at 13px on this light background,
                ink-faint measures ~4.3:1 — just under WCAG AA's 4.5:1
                floor for normal text; ink-soft measures ~7:1. */}
            <p className="kt-figure" style={{ fontSize: "13px", color: "var(--color-ink-soft)" }}>
              {DATE_FORMATTERS[locale].format(new Date(post.publishedAt))} ·{" "}
              {common("minuteRead", { minutes: post.minuteRead })}
            </p>
            <h1 style={{ marginTop: "var(--space-md)" }}>{post.title[locale]}</h1>
            <div style={{ marginTop: "var(--space-2xl)" }}>
              {post.body[locale].map(renderBlock)}
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
