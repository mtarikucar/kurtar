import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "large";
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

/** The one Button every screen uses — min 44px tap target per the brief's
 * mobile-first/one-handed requirement. `loading` disables the button AND
 * shows a spinner so a merchant can never double-fire a money/publish
 * action by tapping twice while a request is in flight. */
export function Button({
  variant = "primary",
  size = "default",
  fullWidth,
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === "large" ? styles.large : "",
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
