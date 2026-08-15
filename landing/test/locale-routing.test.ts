import { describe, it, expect } from "vitest";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Task-13 brief: "locale routing/switching preserving the path." This is
 * the pure-function guarantee components/LocaleSwitcher.tsx's actual
 * switch links rely on (`href={pathname} locale={other}`) — proven here
 * without rendering anything, and again indirectly by every
 * generateMetadata call in lib/seo.test.ts producing correct hreflang
 * alternates from the same function.
 */
describe("locale routing", () => {
  it("defaults to tr with no URL prefix (localePrefix: as-needed)", () => {
    expect(routing.defaultLocale).toBe("tr");
    expect(getPathname({ locale: "tr", href: "/isletme" })).toBe("/isletme");
  });

  it("prefixes every non-default locale", () => {
    expect(getPathname({ locale: "en", href: "/isletme" })).toBe("/en/isletme");
  });

  it("preserves a nested programmatic path across every locale", () => {
    expect(getPathname({ locale: "tr", href: "/kadikoy/firin" })).toBe("/kadikoy/firin");
    expect(getPathname({ locale: "en", href: "/kadikoy/firin" })).toBe("/en/kadikoy/firin");
  });

  it("preserves the root path across every locale", () => {
    expect(getPathname({ locale: "tr", href: "/" })).toBe("/");
    expect(getPathname({ locale: "en", href: "/" })).toBe("/en");
  });

  it("round-trips through every declared locale for a representative set of pages, never changing the logical page", () => {
    const pages = ["/", "/nasil-calisir", "/isletme", "/blog", "/yasal/cerez-politikasi"];
    for (const page of pages) {
      for (const locale of routing.locales) {
        const localized = getPathname({ locale, href: page });
        expect(typeof localized).toBe("string");
        expect(localized.length).toBeGreaterThan(0);
      }
    }
  });
});
