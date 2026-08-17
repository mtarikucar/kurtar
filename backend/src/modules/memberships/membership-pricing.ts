import { applyRateCents } from "../settlements/settlement-math";

/**
 * [Fix round, P2] KDV %20 on the membership fee — mirrors the bag fee's
 * rate exactly (settlement-math.ts's VAT_RATE_NUMERATOR/DENOMINATOR are
 * module-private to that file's own line-level computation). This is the
 * ONE shared place for the membership side of the same %20 rate — both
 * memberships.service.ts (initial period, on merchant approval) and
 * membership-renewal-cron.service.ts (every subsequent period) compute a
 * period's VAT through this single helper, so there is exactly one
 * membership-VAT rounding rule in the codebase, not one per call site.
 */
export const MEMBERSHIP_VAT_NUMERATOR = 20;
export const MEMBERSHIP_VAT_DENOMINATOR = 100;

export function computeMembershipVatCents(priceCents: number): number {
  return applyRateCents(
    priceCents,
    MEMBERSHIP_VAT_NUMERATOR,
    MEMBERSHIP_VAT_DENOMINATOR,
  );
}
