/**
 * Every money amount in the kurtar API travels as integer kuruş (cents of
 * Turkish Lira) — `grossCents`, `netPayoutCents`, `bagFeeCents`, etc. This
 * is the ONE place that turns that into a display string, so a settlement
 * breakdown and a dashboard GMV tile never format money two different ways.
 * Re-exported under this app's existing name from the shared
 * `@kurtar/ui-tokens` formatter — see merchant-web's src/shared/format.ts
 * for the same re-export and why (Task 14's consistency sweep).
 */
import { formatMoneyCents } from "@kurtar/ui-tokens";

export const formatCents = formatMoneyCents;

/** Signed variant — settlement breakdown rows show deductions as negative
 * (e.g. `-₺12,50` for a clawback), which Intl's default formatter already
 * handles correctly, but call sites read clearer naming this explicitly. */
export function formatSignedCents(cents: number): string {
  return formatCents(cents);
}
