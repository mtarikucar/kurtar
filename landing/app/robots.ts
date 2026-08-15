import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /o/[id] bridge pages are for a human clicking a share link, not
        // for organic search discovery — same reasoning sitemap.ts uses
        // to exclude them from the sitemap itself.
        disallow: ["/o/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
