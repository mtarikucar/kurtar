import { describe, it, expect } from "vitest";
import { cities } from "@/content/cities";
import { categories } from "@/content/categories";
import { buildIntro } from "@/content/programmatic";
import { blogPosts } from "@/content/blog/posts";
import { legalDocuments } from "@/content/legal";

describe("content modules — structural integrity", () => {
  it("every category has non-empty tr/en copy for every field", () => {
    for (const category of categories) {
      for (const locale of ["tr", "en"] as const) {
        expect(category.name[locale].length).toBeGreaterThan(0);
        expect(category.hook[locale].length).toBeGreaterThan(10);
        expect(category.fact[locale].length).toBeGreaterThan(10);
      }
      expect(category.valueRangeCents[0]).toBeLessThan(category.valueRangeCents[1]);
      expect(category.startingPriceCents).toBeGreaterThan(0);
    }
  });

  it("every city has non-empty tr/en copy and at least 3 named neighbourhoods", () => {
    for (const city of cities) {
      for (const locale of ["tr", "en"] as const) {
        expect(city.character[locale].length).toBeGreaterThan(50);
        expect(city.neighbourhoods[locale].length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("every legal document has matching-length blocks across locales, and no unresolved [BRACKETED PLACEHOLDER] leaks into a heading", () => {
    for (const doc of legalDocuments) {
      expect(doc.blocks.tr.length).toBe(doc.blocks.en.length);
      expect(doc.intro.tr.length).toBe(doc.intro.en.length);
      for (const locale of ["tr", "en"] as const) {
        for (const block of doc.blocks[locale]) {
          if (block.heading) expect(block.heading).not.toMatch(/\[.*TBD.*\]/i);
        }
      }
    }
  });

  it("every blog post has a title, description, and at least 3 body blocks in both locales", () => {
    for (const post of blogPosts) {
      for (const locale of ["tr", "en"] as const) {
        expect(post.title[locale].length).toBeGreaterThan(0);
        expect(post.description[locale].length).toBeGreaterThan(0);
        expect(post.body[locale].length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("buildIntro — programmatic page copy is genuinely distinct per combination", () => {
  it("produces 20 unique paragraphs across all city x category combinations (tr)", () => {
    const paragraphs = cities.flatMap((city) =>
      categories.map((category) => buildIntro(city, category, "tr")),
    );
    expect(paragraphs).toHaveLength(20);
    expect(new Set(paragraphs).size).toBe(20);
  });

  it("produces 20 unique paragraphs across all city x category combinations (en)", () => {
    const paragraphs = cities.flatMap((city) =>
      categories.map((category) => buildIntro(city, category, "en")),
    );
    expect(paragraphs).toHaveLength(20);
    expect(new Set(paragraphs).size).toBe(20);
  });

  it("two different cities with the SAME category produce paragraphs with no shared proper-noun sentence template collision (different city names appear)", () => {
    const kadikoyFirin = buildIntro(cities[0], categories[0], "tr");
    const besiktasFirin = buildIntro(cities[1], categories[0], "tr");
    expect(kadikoyFirin).not.toBe(besiktasFirin);
    expect(kadikoyFirin).toContain(cities[0].name.tr);
    expect(besiktasFirin).toContain(cities[1].name.tr);
  });

  it("the same city with different categories produces paragraphs that differ by more than the category name (distinct sentence shape)", () => {
    const kadikoyFirin = buildIntro(cities[0], categories[0], "tr");
    const kadikoyManav = buildIntro(cities[0], categories[4], "tr");
    expect(kadikoyFirin).not.toBe(kadikoyManav);
  });
});
