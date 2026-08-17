import type { ReactNode } from "react";

export interface ReceiptRow {
  label: string;
  value: string;
  total?: boolean;
}

interface ReceiptProps {
  title: string;
  rows: ReceiptRow[];
  note?: ReactNode;
}

/**
 * The site's signature device (see app/globals.css's ".kt-receipt" block
 * for the rationale) — every worked money example on the site (hero,
 * /isletme fee breakdown, /nasil-calisir price example, category price
 * anchors) renders through this ONE component so a reader learns to read
 * kurtar's numbers the same way everywhere: dotted leaders, tabular
 * monospace values, a totalled last row.
 */
export function Receipt({ title, rows, note }: ReceiptProps) {
  return (
    <div className="kt-receipt">
      <p className="kt-receipt__title">{title}</p>
      {rows.map((row) => (
        <div
          key={row.label}
          className={`kt-receipt__row${row.total ? " kt-receipt__row--total" : ""}`}
        >
          <span className="kt-receipt__label">{row.label}</span>
          <span className="kt-receipt__leader" aria-hidden="true" />
          <span className="kt-receipt__value kt-figure">{row.value}</span>
        </div>
      ))}
      {note ? <p className="kt-receipt__note">{note}</p> : null}
    </div>
  );
}
