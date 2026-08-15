import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { legalDocuments } from "@/content/legal";

export function Footer() {
  const t = useTranslations("footer");
  const common = useTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="kt-footer">
      <div className="kt-container kt-section">
        <div className="kt-footer__grid">
          <div>
            <p className="kt-footer__heading">{common("brand")}</p>
            <p style={{ maxWidth: "32ch", color: "var(--color-line)" }}>{t("tagline")}</p>
          </div>
          <div>
            <p className="kt-footer__heading">{t("productHeading")}</p>
            <div className="kt-footer__links">
              <Link href="/">{t("links.home")}</Link>
              <Link href="/nasil-calisir">{t("links.howItWorks")}</Link>
              <Link href="/isletme">{t("links.forMerchants")}</Link>
              <Link href="/blog">{t("links.blog")}</Link>
            </div>
          </div>
          <div>
            <p className="kt-footer__heading">{t("legalHeading")}</p>
            <div className="kt-footer__links">
              {legalDocuments.map((doc) => (
                <Link key={doc.slug} href={`/yasal/${doc.slug}`}>
                  {t(`legalLinks.${legalLinkKey(doc.slug)}`)}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="kt-footer__heading">{t("languageHeading")}</p>
            <div className="kt-footer__links">
              <span>Türkçe / English — {common("brand")}</span>
            </div>
          </div>
        </div>
        <div className="kt-footer__bottom">
          <span>
            © {year} {common("brand")}. {t("rights")}
          </span>
        </div>
      </div>
    </footer>
  );
}

function legalLinkKey(slug: string): string {
  const map: Record<string, string> = {
    "aracilik-sozlesmesi": "intermediation",
    "mesafeli-satis-sozlesmesi": "distanceSelling",
    "on-bilgilendirme-formu": "preInfo",
    "kvkk-aydinlatma-metni": "kvkk",
    "cerez-politikasi": "cookies",
  };
  return map[slug] ?? slug;
}
