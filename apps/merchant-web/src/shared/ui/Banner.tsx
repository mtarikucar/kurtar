import type { ReactNode } from "react";
import styles from "./Banner.module.css";

export interface BannerProps {
  tone?: "info" | "warning" | "danger" | "success" | "neutral";
  heading?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

/** Used for every empty/error/warning/success state across the app — one
 * component so those states look and behave consistently everywhere. */
export function Banner({
  tone = "neutral",
  heading,
  children,
  action,
}: BannerProps) {
  const role = tone === "danger" ? "alert" : "status";
  return (
    <div className={[styles.banner, styles[tone]].join(" ")} role={role}>
      {heading ? <p className={styles.heading}>{heading}</p> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
