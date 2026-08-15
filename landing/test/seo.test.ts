import { describe, it, expect } from "vitest";
import type { Metadata } from "next";
import { buildPageMetadata, buildFaqJsonLd, buildOrganizationJsonLd, buildArticleJsonLd, buildBreadcrumbJsonLd } from "@/lib/seo";

/** Next's `Metadata["openGraph"]` is a discriminated union keyed by `type`
 * (website/article/...); narrowing it just to read that one field back
 * out in a test doesn't need `any`. */
function openGraphType(og: Metadata["openGraph"]): string | undefined {
  return og && "type" in og ? og.type : undefined;
}

describe("buildPageMetadata", () => {
  it("builds a canonical URL and hreflang alternates for a tr (default, unprefixed) page", () => {
    const meta = buildPageMetadata({
      locale: "tr",
      pathname: "/isletme",
      title: "İşletmeniz için kurtar",
      description: "test",
    });
    expect(meta.alternates?.canonical).toBe("https://kurtar.app/isletme");
    expect(meta.alternates?.languages).toMatchObject({
      tr: "https://kurtar.app/isletme",
      en: "https://kurtar.app/en/isletme",
      "x-default": "https://kurtar.app/isletme",
    });
  });

  it("builds a canonical URL and hreflang alternates for an en (prefixed) page", () => {
    const meta = buildPageMetadata({
      locale: "en",
      pathname: "/isletme",
      title: "kurtar for your business",
      description: "test",
    });
    expect(meta.alternates?.canonical).toBe("https://kurtar.app/en/isletme");
  });

  it("sets openGraph.type per page type (website vs article)", () => {
    const websiteMeta = buildPageMetadata({
      locale: "tr",
      pathname: "/",
      title: "kurtar",
      description: "test",
    });
    expect(openGraphType(websiteMeta.openGraph)).toBe("website");

    const articleMeta = buildPageMetadata({
      locale: "tr",
      pathname: "/blog/example",
      title: "Bir blog yazısı",
      description: "test",
      type: "article",
    });
    expect(openGraphType(articleMeta.openGraph)).toBe("article");
  });

  it("does not set openGraph.images/twitter.images — Next's file-convention opengraph-image.tsx owns that", () => {
    const meta = buildPageMetadata({
      locale: "tr",
      pathname: "/",
      title: "kurtar",
      description: "test",
    });
    expect(meta.openGraph && "images" in meta.openGraph ? meta.openGraph.images : undefined).toBeUndefined();
  });

  it("builds correct URLs for a nested programmatic pathname", () => {
    const meta = buildPageMetadata({
      locale: "en",
      pathname: "/kadikoy/firin",
      title: "Bakery — Kadıköy",
      description: "test",
    });
    expect(meta.alternates?.canonical).toBe("https://kurtar.app/en/kadikoy/firin");
    expect(meta.alternates?.languages?.tr).toBe("https://kurtar.app/kadikoy/firin");
  });
});

describe("JSON-LD builders", () => {
  it("buildOrganizationJsonLd produces a valid Organization shape", () => {
    const data = buildOrganizationJsonLd();
    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("kurtar");
    expect(typeof data.url).toBe("string");
  });

  it("buildFaqJsonLd maps every FAQ item to a Question/Answer pair", () => {
    const items = [
      { question: "Soru 1?", answer: "Cevap 1." },
      { question: "Soru 2?", answer: "Cevap 2." },
    ];
    const data = buildFaqJsonLd(items);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(2);
    expect(data.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "Soru 1?",
      acceptedAnswer: { "@type": "Answer", text: "Cevap 1." },
    });
  });

  it("buildBreadcrumbJsonLd produces positioned list items", () => {
    const data = buildBreadcrumbJsonLd([
      { name: "Anasayfa", url: "/" },
      { name: "Kadıköy", url: "/kadikoy/firin" },
    ]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement[0]).toMatchObject({ "@type": "ListItem", position: 1, name: "Anasayfa" });
    expect(data.itemListElement[1].position).toBe(2);
  });

  it("buildArticleJsonLd produces a valid Article shape", () => {
    const data = buildArticleJsonLd({
      headline: "Test başlık",
      description: "Test açıklama",
      datePublished: "2026-07-14",
      pathname: "/blog/test",
      locale: "tr",
    });
    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBe("Test başlık");
    expect(data.datePublished).toBe("2026-07-14");
  });
});
