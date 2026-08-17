-- [Fix round #2, P1-minor] writtenOffCents is net+KDV combined (post-P2,
-- outstandingCents itself is combined) — a finance query summing
-- writtenOffCents alone overstates "how much membership REVENUE did we
-- write off" by the VAT component. This adds the VAT-only breakdown so
-- writtenOffCents - writtenOffVatCents is the true forgiven-revenue figure,
-- directly in SQL, mirroring the outstandingCents/outstandingVatCents split.
ALTER TABLE "membership_subscriptions"
  ADD COLUMN "writtenOffVatCents" INTEGER NOT NULL DEFAULT 0;
