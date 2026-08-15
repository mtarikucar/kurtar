import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Nav() {
  const t = useTranslations("nav");
  const common = useTranslations("common");

  return (
    <header className="kt-nav">
      <a href="#main" className="kt-skip-link">
        {common("skipToContent")}
      </a>
      <div className="kt-container kt-nav__row">
        <Link href="/" className="kt-nav__brand">
          {common("brand")}
        </Link>
        <nav className="kt-nav__links" aria-label={t("mainLabel")}>
          <Link href="/nasil-calisir">{t("howItWorks")}</Link>
          <Link href="/isletme">{t("forMerchants")}</Link>
          <Link href="/blog">{t("blog")}</Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
