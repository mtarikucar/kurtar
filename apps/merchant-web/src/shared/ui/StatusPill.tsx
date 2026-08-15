import type { ReactNode } from "react";
import styles from "./StatusPill.module.css";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span className={[styles.pill, styles[tone]].join(" ")}>{children}</span>
  );
}
