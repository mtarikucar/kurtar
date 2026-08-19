import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { OfferAppOpener } from "@/components/OfferAppOpener";
import { OfferPreview } from "@/components/OfferPreview";
import { getOfferPreview } from "@/lib/offer";
import { formatMoneyCents, formatPickupWindow } from "@/lib/format";
import { APP_LINKS } from "@/lib/site-config";
import type { AppLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: AppLocale; id: string }>;
}

/**
 * A shared-offer universal link.
 *
 * The page reads the offer it is about: `GET /discovery/offers/{id}`
 * (backend's discovery.controller.ts, exposed as
 * `client.discovery.offer(id)` and already used by apps/consumer's own
 * /o/[id] screen). A share link's one high-leverage moment is the instant
 * the recipient opens it, and this page used to spend it on a blank
 * "open the app" panel — no shop, no price, no window, in the page AND
 * in the og card the chat app unfurls.
 *
 * When the offer cannot be read — sold out, window closed, backend down,
 * NEXT_PUBLIC_API_BASE_URL unset — it falls back to exactly the generic
 * bridge it used to be, never an error page (lib/offer.ts).
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "offerBridge" });
  const offer = await getOfferPreview(id);

  // The og card is the only part of this page most people ever see: it is
  // what WhatsApp/iMessage unfurl in the thread, above the link nobody
  // has tapped yet.
  const title =
    offer.status === "ok"
      ? t("previewMetaTitle", { store: offer.storeName })
      : t("title");
  const description =
    offer.status === "ok"
      ? t("previewMetaDescription", {
          price: formatMoneyCents(offer.priceCents, locale),
          window: formatPickupWindow(offer.pickupStartAt, offer.pickupEndAt),
          district: offer.district,
        })
      : t("body");

  return buildPageMetadata({ locale, pathname: `/o/${id}`, title, description });
}

export default async function OfferBridgePage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("offerBridge");
  const offer = await getOfferPreview(id);

  return (
    <section className="kt-section" style={{ textAlign: "center" }}>
      <div className="kt-container" style={{ maxWidth: "480px", marginInline: "auto" }}>
        {offer.status === "ok" ? (
          <OfferPreview
            offer={offer}
            locale={locale}
            labels={{
              panelTitle: t("previewPanelTitle"),
              pickupLabel: t("previewPickupLabel"),
              valueLabel: t("previewValueLabel"),
              priceLabel: t("previewPriceLabel"),
              body: t("previewBody"),
            }}
          />
        ) : (
          <>
            <h1 style={{ fontSize: "28px" }}>{t("title")}</h1>
            <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)" }}>
              {t("body")}
            </p>
          </>
        )}

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
