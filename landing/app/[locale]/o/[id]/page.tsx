import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { OfferAppOpener } from "@/components/OfferAppOpener";
import { APP_LINKS } from "@/lib/site-config";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale; id: string }>;
}

/**
 * A shared-offer universal link. There is no public "get one offer by
 * id" endpoint in the backend today (discovery.controller.ts exposes
 * `offers` (a filtered list) and `stores/:id`, not a single-offer
 * lookup) — see landing/README.md's "known gaps" note. This page is
 * therefore a generic, brand-consistent bridge (try to open the app;
 * otherwise offer app-store CTAs), not a rich per-offer preview with the
 * store name/photo/price. A future backend endpoint would let this page
 * render that richer preview without changing its URL shape.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "offerBridge" });
  return buildPageMetadata({
    locale,
    pathname: `/o/${id}`,
    title: t("title"),
    description: t("body"),
  });
}

export default async function OfferBridgePage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("offerBridge");

  return (
    <section className="kt-section" style={{ textAlign: "center" }}>
      <div className="kt-container" style={{ maxWidth: "480px", marginInline: "auto" }}>
        <h1 style={{ fontSize: "28px" }}>{t("title")}</h1>
        <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)" }}>{t("body")}</p>

        <OfferAppOpener
          offerId={id}
          labels={{ openingApp: t("openingApp"), noApp: t("noApp") }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", marginTop: "var(--space-2xl)" }}>
          <a href={APP_LINKS.iosAppStoreUrl} className="kt-btn kt-btn--primary">
            {t("downloadCta")}
          </a>
          <Link href="/" className="kt-btn kt-btn--secondary">
            {t("webCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
