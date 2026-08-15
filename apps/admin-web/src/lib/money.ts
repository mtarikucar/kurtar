/**
 * Every money amount in the kurtar API travels as integer kuruş (cents of
 * Turkish Lira) — `grossCents`, `netPayoutCents`, `bagFeeCents`, etc. This
 * is the ONE place that turns that into a display string, so a settlement
 * breakdown and a dashboard GMV tile never format money two different ways.
 */
const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** Signed variant — settlement breakdown rows show deductions as negative
 * (e.g. `-₺12,50` for a clawback), which Intl's default formatter already
 * handles correctly, but call sites read clearer naming this explicitly. */
export function formatSignedCents(cents: number): string {
  return formatCents(cents);
}
