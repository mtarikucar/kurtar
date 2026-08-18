import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import styles from "./AppLayout.module.css";

const NAV_ITEMS = [
  { to: "/", key: "dashboard", end: true },
  { to: "/merchants", key: "merchants" },
  { to: "/complaints", key: "complaints" },
  { to: "/moderation", key: "moderation" },
  { to: "/settlements", key: "settlements" },
  // [M16 fix] The commission e-invoice DRAFT queue — a failed e-document
  // issuance had no surface at all before this.
  { to: "/invoices", key: "invoices" },
  { to: "/pricing", key: "pricing" },
  { to: "/ratings", key: "ratings" },
  { to: "/exports", key: "exports" },
] as const;

/** Desktop-first shell: a persistent sidebar (never collapses to a
 * hamburger — brief §Cross-cutting requires this to survive down to
 * 1024px, not adapt to a phone width) plus a header carrying the signed-in
 * admin's identity and sign-out. */
export function AppLayout() {
  const { t } = useTranslation(["common", "auth"]);
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>{t("common:app.title")}</div>
        <nav aria-label={t("common:app.title")}>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) =>
                    isActive
                      ? `${styles.navLink} ${styles.navLinkActive}`
                      : styles.navLink
                  }
                >
                  {t(`common:nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <span className={styles.userName}>
            {user?.name ?? t("auth:session.fallbackName")}
          </span>
          <button
            type="button"
            className={styles.logoutButton}
            onClick={() => void logout()}
          >
            {t("common:nav.logout")}
          </button>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
