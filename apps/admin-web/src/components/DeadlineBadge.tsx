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
      role="status"
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
