import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { BottomNav } from "./BottomNav";
import styles from "./AppShell.module.css";

/** App chrome for every authenticated+approved screen: a top bar (business
 * name + logout) and a fixed bottom tab bar, wrapping a scrollable content
 * area. Mobile-first: the bottom nav is always in one-handed thumb reach. */
export function AppShell() {
  const { t } = useTranslation("common");
  const { merchant, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.tradeName}>
          {merchant?.tradeName ?? t("appName")}
        </span>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void logout()}
        >
          {t("actions.logout")}
        </button>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
