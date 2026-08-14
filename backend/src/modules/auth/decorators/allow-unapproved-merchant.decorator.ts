import { SetMetadata } from "@nestjs/common";

/**
 * Opts a route OUT of MerchantApprovalGuard's default-deny for MERCHANT
 * actors. Deliberately the inverse of an opt-IN "@RequireApproved" model:
 * a security review of the original suspend kill-switch found that
 * ad-hoc, per-service `verificationStatus !== 'APPROVED'` checks are easy
 * to add to ONE write path (stores.create) and easy to forget on the
 * next one (stores.update, bag-templates, offers) — a suspended merchant
 * could walk straight around the kill-switch by hitting an unguarded
 * route. An opt-IN decorator has the exact same forgettability problem in
 * the other direction: a NEW route that should require approval but never
 * gets the decorator ships unprotected, silently.
 *
 * This decorator instead marks the rare EXCEPTION: MerchantApprovalGuard
 * (a global APP_GUARD) blocks every MERCHANT-actor request by default
 * unless verificationStatus is APPROVED, and only routes explicitly
 * annotated `@AllowUnapprovedMerchant()` are exempt — mirroring
 * `@Public()`'s own default-deny-unless-annotated shape
 * (decorators/public.decorator.ts). A route nobody remembers to annotate
 * fails CLOSED (403) rather than open, which is the safe direction for a
 * forgotten check to fail in.
 */
export const ALLOW_UNAPPROVED_MERCHANT_KEY = "allowUnapprovedMerchant";
export const AllowUnapprovedMerchant = () =>
  SetMetadata(ALLOW_UNAPPROVED_MERCHANT_KEY, true);
