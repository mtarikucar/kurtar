import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./Form.module.css";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={styles.field}>
      <label
        htmlFor={id}
        className={[styles.label, required ? styles.required : ""].join(" ")}
      >
        {label}
      </label>
      <select
        id={id}
        className={[
          styles.control,
          error ? styles.controlError : "",
          className ?? "",
        ].join(" ")}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={error ? true : undefined}
        aria-required={required}
        {...rest}
      >
        {children}
      </select>
      {hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.errorText} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
