import styles from "./Stepper.module.css";

export interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

/** A +/- quantity control — 44px tap targets, no on-screen keyboard needed,
 * which is the whole point behind a counter (fast, one-handed, no typing)
 * for the quick-publish flow. */
export function Stepper({
  label,
  value,
  min = 1,
  max = 999,
  onChange,
}: StepperProps) {
  return (
    <div className={styles.wrap} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${label} azalt`}
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${label} artır`}
      >
        +
      </button>
    </div>
  );
}
