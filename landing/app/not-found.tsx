import Link from "next/link";
import "./globals.css";

/**
 * Root not-found — renders only when a request doesn't match ANY locale
 * segment at all (an edge case; middleware.ts normally routes every real
 * path into `[locale]`, which has its own locale-aware not-found.tsx).
 * No `getTranslations` here: this file sits outside the `[locale]` tree,
 * so there is no request locale to read — hardcoded Turkish (the site's
 * default locale) is the deliberate, narrow exception to "no hardcoded
 * user-facing strings" for this one unreachable-in-normal-use fallback.
 */
export default function RootNotFound() {
  return (
    <html lang="tr">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <h1>Bu sayfa bulunamadı</h1>
          <p>Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
          <Link href="/" className="kt-btn kt-btn--primary">
            Anasayfaya dön
          </Link>
        </main>
      </body>
    </html>
  );
}
