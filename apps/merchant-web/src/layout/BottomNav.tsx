import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../routes";
import styles from "./BottomNav.module.css";

type IconProps = { className?: string };

function SunIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

function ShopIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9l1-5h14l1 5" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M4 9h16" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function WalletIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1" />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z" />
    </svg>
  );
}

const ITEMS = [
  { to: ROUTES.today, labelKey: "today", Icon: SunIcon },
  { to: ROUTES.stores, labelKey: "stores", Icon: ShopIcon },
  { to: ROUTES.calendar, labelKey: "calendar", Icon: CalendarIcon },
  { to: ROUTES.earnings, labelKey: "earnings", Icon: WalletIcon },
  { to: ROUTES.reputation, labelKey: "reputation", Icon: StarIcon },
] as const;

export function BottomNav() {
  const { t } = useTranslation("nav");
  return (
    <nav className={styles.nav} aria-label={t("mainLabel")}>
      {ITEMS.map(({ to, labelKey, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [styles.item, isActive ? styles.itemActive : ""].join(" ")
          }
        >
          <Icon className={styles.icon} />
          <span>{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
