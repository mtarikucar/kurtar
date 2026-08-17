import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { getAllInternalPathnames } from "@/lib/routes";
import { cities } from "@/content/cities";
import { categories } from "@/content/categories";
import { routing } from "@/i18n/routing";

describe("getAllInternalPathnames", () => {
  it("contains every one of the 20 curated programmatic city/category combinations, exactly once", () => {
    const pathnames = getAllInternalPathnames();
    const programmaticPaths = cities.flatMap((city) =>
      categories.map((category) => `/${city.slug}/${category.slug}`),
    );
    expect(programmaticPaths).toHaveLength(20);

    for (const path of programmaticPaths) {
      const occurrences = pathnames.filter((p) => p === path).length;
      expect(occurrences, `${path} should appear exactly once`).toBe(1);
    }
  });

  it("has no duplicate pathname at all", () => {
    const pathnames = getAllInternalPathnames();
    expect(new Set(pathnames).size).toBe(pathnames.length);
  });
});

describe("sitemap()", () => {
  it("emits exactly one entry per (pathname, locale) — every programmatic route exactly once per locale", () => {
    const entries = sitemap();
    const pathnames = getAllInternalPathnames();
    expect(entries).toHaveLength(pathnames.length * routing.locales.length);

    // No duplicate URLs anywhere in the sitemap.
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("includes both the Turkish (unprefixed) and English (/en-prefixed) URL for a programmatic page", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/kadikoy/firin"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/en/kadikoy/firin"))).toBe(true);
  });

  it("every entry declares hreflang alternates for both locales", () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.alternates?.languages?.tr).toBeTruthy();
      expect(entry.alternates?.languages?.en).toBeTruthy();
    }
  });

  it("never includes an /o/[id] offer-bridge URL (ephemeral, not for organic discovery)", () => {
    const entries = sitemap();
    expect(entries.some((entry) => entry.url.includes("/o/"))).toBe(false);
  });
});
