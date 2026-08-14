-- Task 8 fix round (post-review policy decisions P1/P2 + critical fixes
-- C2/C3): membership KDV, membership-forgiveness write-off tracking, and
-- two settlement-batch guard columns that close real money bugs found in
-- review. Every addition is nullable or DEFAULTed — safe against existing
-- rows (this repo is pre-production; no real membership/settlement data
-- exists anywhere this migration runs).
--
-- 1. membership_subscriptions.vatCents / outstandingVatCents /
--    writtenOffCents — see schema.prisma's comments on
--    MembershipSubscription for the full story: membership dues now carry
--    KDV %20 exactly like the bag fee (P2), and a renewal that forgives an
--    unrecovered balance (P1's deliberate policy, "you don't pay until you
--    earn") now leaves a permanent, queryable trace on the subscription
--    itself, alongside the audit_logs row memberships/membership-renewal-
--    cron.service.ts writes at the same instant.
--
-- 2. settlement_batches.carriedExternalDemandCents / shortfallResolvedAt —
--    closes a real bug (C2): a HELD batch's OWN carried shortfall was
--    silently dropped on a second recompute (an admin retry) because the
--    merchant's most-recent-OTHER-batch lookup deliberately excludes the
--    batch being recomputed. shortfallResolvedAt makes that cross-batch
--    inheritance a one-time event; carriedExternalDemandCents is the
--    externally-caused portion of carriedShortfallCents that then feeds
--    forward on every later pass — DELIBERATELY a separate column from
--    carriedShortfallCents (which also includes this batch's OWN fee
--    deficit, already re-derived fresh from its lines every pass): the
--    first draft of this fix fed the full carriedShortfallCents back in
--    and double-counted the own-fee-deficit component, making a batch's
--    reported shortfall grow on every retry instead of converging.
--
-- 3. settlement_batches.payoutAttemptedAt — closes another real bug (C3):
--    without a sentinel, an admin could hold() an APPROVED batch in the
--    window between a provider payout call succeeding and the DB write
--    that records it, then a later recompute could change netPayoutCents,
--    and a retried payout() call would silently replay the ORIGINAL
--    (now-stale) provider transfer under a mismatched recorded amount.
--    Once this is set, hold()/recomputeBatch() both refuse to touch the
--    batch — the amount a provider was told to move is frozen from the
--    moment the FIRST attempt begins.

ALTER TABLE "membership_subscriptions"
  ADD COLUMN "vatCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outstandingVatCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "writtenOffCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "settlement_batches"
  ADD COLUMN "membershipOffsetVatCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "carriedExternalDemandCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shortfallResolvedAt" TIMESTAMP(3),
  ADD COLUMN "payoutAttemptedAt" TIMESTAMP(3);
