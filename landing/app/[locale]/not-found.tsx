import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Locale-aware 404 — next-intl's own recommended pattern (a plain
 * `notFound()` call from a page under `[locale]` renders THIS file, which
 * still has request-scoped translations available, unlike the root
 * `app/not-found.tsx` which renders for a path outside any locale
 * segment at all and therefore cannot call `getTranslations`).
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");

  return (
    <section className="kt-section" style={{ textAlign: "center" }}>
      <div className="kt-container">
        <h1>{t("title")}</h1>
        <p style={{ marginTop: "var(--space-md)", color: "var(--color-ink-soft)" }}>{t("body")}</p>
        <Link href="/" className="kt-btn kt-btn--primary" style={{ marginTop: "var(--space-2xl)" }}>
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
