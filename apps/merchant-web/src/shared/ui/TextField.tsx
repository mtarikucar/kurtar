import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./Form.module.css";

interface BaseProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export interface TextFieldProps
  extends BaseProps, InputHTMLAttributes<HTMLInputElement> {
  multiline?: false;
}

export interface TextAreaFieldProps
  extends BaseProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  multiline: true;
}

/** Labelled text input with hint/error slots — every form field in the app
 * goes through this (or SelectField/Checkbox) so labels, focus rings, and
 * error presentation are consistent and every input has a REAL <label>
 * (never a placeholder standing in for one). */
export function TextField(props: TextFieldProps | TextAreaFieldProps) {
  const { label, hint, error, required, multiline, className, ...rest } = props;
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const controlClassName = [
    styles.control,
    multiline ? styles.textarea : "",
    error ? styles.controlError : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label
        htmlFor={id}
        className={[styles.label, required ? styles.required : ""].join(" ")}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={controlClassName}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          className={controlClassName}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
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
