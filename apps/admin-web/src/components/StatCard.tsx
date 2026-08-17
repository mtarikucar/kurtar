import { Link } from "react-router-dom";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Every dashboard number links to its filtered queue (brief
   * requirement) — omit only for the two plain "today" metrics that have
   * no queue of their own (GMV, redeemed count). */
  to?: string;
  /** Renders the card in an urgent visual treatment (breached/at-risk
   * counts) — colour plus a distinct border, never colour alone. */
  urgent?: boolean;
}

export function StatCard({ label, value, to, urgent }: StatCardProps) {
  const content = (
    <>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
    </>
  );

  const className = `${styles.card} ${urgent ? styles.urgent : ""}`;

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
