import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { getSortedBlogPosts } from "@/content/blog/posts";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog.meta" });
  return buildPageMetadata({
    locale,
    pathname: "/blog",
    title: t("title"),
    description: t("description"),
  });
}

const DATE_FORMATTERS: Record<AppLocale, Intl.DateTimeFormat> = {
  tr: new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }),
};

export default async function BlogIndexPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("blog");
  const common = await getTranslations("common");
  const posts = getSortedBlogPosts();

  return (
    <section className="kt-section">
      <div className="kt-container">
        <h1>{t("hero.title")}</h1>
        <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)", maxWidth: "60ch" }}>
          {t("hero.body")}
        </p>
        {posts.length === 0 ? (
          <p style={{ marginTop: "var(--space-2xl)" }}>{t("empty")}</p>
        ) : (
          <div style={{ marginTop: "var(--space-2xl)", display: "grid", gap: "var(--space-xl)" }}>
            {posts.map((post) => (
              <article key={post.slug} className="kt-card">
                <p className="kt-figure" style={{ fontSize: "13px", color: "var(--color-ink-soft)" }}>
                  {DATE_FORMATTERS[locale].format(new Date(post.publishedAt))} ·{" "}
                  {common("minuteRead", { minutes: post.minuteRead })}
                </p>
                <h2 style={{ fontSize: "22px", marginTop: "var(--space-sm)" }}>
                  <Link href={`/blog/${post.slug}`}>{post.title[locale]}</Link>
                </h2>
                <p style={{ marginTop: "var(--space-sm)", color: "var(--color-ink-soft)" }}>
                  {post.description[locale]}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{ display: "inline-block", marginTop: "var(--space-lg)", fontWeight: 700, color: "var(--color-orange-700)" }}
                >
                  {common("readMore")} →
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
