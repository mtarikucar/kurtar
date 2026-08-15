import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Form.module.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: ReactNode;
}

/** A real checkbox + real <label>, min-44px row height — used for the
 * onboarding attestations, the store/template "active" toggle, etc. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  return (
    <div className={styles.checkboxRow}>
      <input
        id={id}
        type="checkbox"
        className={[styles.checkboxInput, className ?? ""].join(" ")}
        {...rest}
      />
      <label htmlFor={id} className={styles.checkboxLabel}>
        {label}
      </label>
    </div>
  );
}
