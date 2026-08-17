import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { colors } from "@kurtar/ui-tokens";
import type { AppLocale } from "@/i18n/routing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "kurtar";

/**
 * The site's one shared Open Graph image (task-13 brief's SEO section:
 * "OG/Twitter" per page) — generated at build time via `next/og`'s
 * ImageResponse (Satori under the hood), not a hand-drawn PNG, so it
 * stays in sync with the brand tokens with zero binary asset to keep in
 * the repo. Placed at the `[locale]` segment so it applies to every page
 * under it automatically (lib/seo.ts's buildPageMetadata deliberately
 * does not set `openGraph.images` itself — see that file's comment).
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.hero" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: colors.neutral[900],
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 700,
            color: colors.primary[500],
            letterSpacing: "-0.02em",
          }}
        >
          kurtar
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 36,
            color: colors.neutral[50],
            maxWidth: 900,
          }}
        >
          {t("title")}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            width: 64,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.secondary[500],
          }}
        />
      </div>
    ),
    { ...size },
  );
}
