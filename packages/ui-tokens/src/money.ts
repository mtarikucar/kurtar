/**
 * The one shared Turkish-lira formatter — every price in the kurtar API
 * travels as an integer kuruş (cents of TRY; see backend/prisma/
 * schema.prisma's money convention and docs/openapi.json). Before this
 * existed, merchant-web, admin-web, and the consumer app each had their
 * own hand-copied formatter — three of the four converged on the SAME
 * `Intl.NumberFormat({style:"currency"})` shape ("₺49,90") but the
 * consumer app's own hand-rolled version produced "49,90 ₺" (the symbol
 * suffixed, via `toLocaleString` + a manually appended "₺") — a real,
 * visible inconsistency a user switching between surfaces would notice,
 * not just duplicated code. This is the single source of truth now.
 *
 * TR-only: landing needs an English variant too (its own bilingual
 * `formatMoneyCents` in landing/lib/format.ts stays separate for that
 * reason) but already produces the identical TR output as this function
 * — verified, not just assumed.
 */
const TR_CURRENCY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer kuruş -> a formatted "₺49,90" string. */
export function formatMoneyCents(cents: number): string {
  return TR_CURRENCY_FORMATTER.format(cents / 100);
}
