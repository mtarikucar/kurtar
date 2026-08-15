import { routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";
import { cities } from "@/content/cities";
import { categories } from "@/content/categories";
import { blogPosts } from "@/content/blog/posts";
import { legalDocuments } from "@/content/legal";

/**
 * Every locale-neutral internal pathname on the site — the single source
 * both `sitemap.ts` and `test/sitemap.test.ts` read from, so the test
 * that asserts "every programmatic route exactly once" is checking the
 * same list the real sitemap ships, not a hand-maintained duplicate that
 * could silently drift from it.
 */
export function getAllInternalPathnames(): string[] {
  const staticPaths = ["/", "/nasil-calisir", "/isletme", "/blog", "/yasal"];
  const legalPaths = legalDocuments.map((doc) => `/yasal/${doc.slug}`);
  const blogPaths = blogPosts.map((post) => `/blog/${post.slug}`);
  const programmaticPaths = cities.flatMap((city) =>
    categories.map((category) => `/${city.slug}/${category.slug}`),
  );

  return [...staticPaths, ...legalPaths, ...blogPaths, ...programmaticPaths];
}

/** For one internal pathname, the localized URL for every locale (used to build sitemap `alternates.languages`). */
export function localizedUrlsFor(pathname: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const locale of routing.locales) {
    entries[locale] = getPathname({ locale, href: pathname });
  }
  return entries;
}
