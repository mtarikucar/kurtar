import { useTranslation } from "react-i18next";
import {
  classifyDeadline,
  toCountdownParts,
  type DeadlineThresholds,
} from "../lib/countdown";
import styles from "./DeadlineBadge.module.css";

export interface DeadlineBadgeProps {
  /** Server-computed remaining milliseconds — negative once breached (see
   * lib/countdown.ts's doc comment). */
  countdownMs: number;
  thresholds: DeadlineThresholds;
  /** Rendered before the countdown text for extra context, e.g. "SLA:". */
  label?: string;
  /**
   * [M21 fix] Announce this badge's text to assistive tech as it changes
   * (`role="status"`, a polite live region). Defaults to false: a queue
   * table renders one of these per row, and an unconditional live region
   * on every row stood up ~20 simultaneous polite regions on one page
   * render — noisy for a screen-reader user, not useful (a list is
   * scanned, not narrated). Pass `true` only on a standalone, single-badge
   * detail view (complaint/settlement detail pages), where announcing a
   * countdown ticking past a threshold is actually meaningful.
   */
  live?: boolean;
}

const URGENCY_ICON: Record<string, string> = {
  safe: "✓", // check mark
  warning: "▲", // triangle
  critical: "⚠", // warning sign
  breached: "✖", // heavy X
};

/**
 * A deadline countdown that is unmissable through THREE independent
 * signals, not colour alone (brief requirement, and its own explicit test:
 * "a breached complaint is visually flagged by something other than
 * colour alone"): (1) an icon glyph that differs by urgency, (2) an
 * always-rendered text label ("ACİL" / "SÜRESİ DOLDU" / …) plus the
 * countdown sentence itself, and (3) a border style that differs (dashed
 * for "warning", solid for "critical"/"breached") — so the state still
 * reads correctly for a colour-blind admin or on a black-and-white
 * printout of an exported queue.
 */
export function DeadlineBadge({
  countdownMs,
  thresholds,
  label,
  live = false,
}: DeadlineBadgeProps) {
  const { t } = useTranslation("common");
  const urgency = classifyDeadline(countdownMs, thresholds);
  const breached = urgency === "breached";
  const parts = toCountdownParts(Math.abs(countdownMs));

  const countdownText = breached
    ? parts.days > 0
      ? t("countdown.breachedDays", { days: parts.days, hours: parts.hours })
      : parts.hours > 0
        ? t("countdown.breachedHours", {
            hours: parts.hours,
            minutes: parts.minutes,
          })
        : t("countdown.breachedMinutes", { minutes: parts.minutes })
    : parts.days > 0
      ? t("countdown.remainingDays", { days: parts.days, hours: parts.hours })
      : parts.hours > 0
        ? t("countdown.remainingHours", {
            hours: parts.hours,
            minutes: parts.minutes,
          })
        : t("countdown.remainingMinutes", { minutes: parts.minutes });

  const urgencyLabel = t(`countdown.${urgency}Label` as const);

  return (
    <span
      className={`${styles.badge} ${styles[urgency]}`}
      data-urgency={urgency}
      role={live ? "status" : undefined}
    >
      <span className={styles.icon} aria-hidden="true">
        {URGENCY_ICON[urgency]}
      </span>
      <span className={styles.text}>
        {label ? <span className={styles.label}>{label} </span> : null}
        <strong className={styles.urgencyWord}>{urgencyLabel}</strong>
        {" — "}
        {countdownText}
      </span>
    </span>
  );
}
