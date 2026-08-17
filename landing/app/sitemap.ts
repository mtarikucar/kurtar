import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo";
import { getAllInternalPathnames, localizedUrlsFor } from "@/lib/routes";

/**
 * One sitemap entry per (pathname, locale) — task-13 brief: "sitemap.ts +
 * robots.ts including the programmatic pages." `/o/[id]` is deliberately
 * excluded: those are ephemeral, per-offer share links with an unbounded
 * ID space, not pages meant for organic discovery/indexing.
 *
 * See test/sitemap.test.ts for "every programmatic route appears exactly
 * once" (per locale) — lib/routes.ts's `getAllInternalPathnames()` is the
 * single list both this file and that test read from.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pathnames = getAllInternalPathnames();

  return pathnames.flatMap((pathname) =>
    routing.locales.map((locale) => {
      const localized = localizedUrlsFor(pathname);
      return {
        url: absoluteUrl(localized[locale]),
        lastModified: new Date(),
        changeFrequency: pathname === "/" ? ("daily" as const) : ("weekly" as const),
        priority: priorityFor(pathname),
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((loc) => [loc, absoluteUrl(localized[loc])]),
          ),
        },
      };
    }),
  );
}

function priorityFor(pathname: string): number {
  if (pathname === "/") return 1;
  if (pathname === "/isletme") return 0.9;
  if (pathname === "/nasil-calisir") return 0.7;
  if (pathname.startsWith("/yasal")) return 0.3;
  if (pathname.startsWith("/blog/")) return 0.6;
  if (pathname === "/blog") return 0.5;
  return 0.6; // programmatic city/category pages
}
