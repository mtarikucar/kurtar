-- Consumer-redeem fix: the approved product design has the CONSUMER
-- redeem their own reservation (a live-clock phone swipe in front of shop
-- staff — the defining interaction of this product category, per the
-- plan's §4.6: "Müşteri ekranında canlı saat + kod; personel önünde
-- swipe -> server-side pencere kontrolü -> yeşil tam-ekran"), with the
-- merchant panel kept as the documented fallback for a dead customer
-- phone. Task 4's own brief said MERCHANT-only, contradicting the plan;
-- the backend faithfully implemented the brief it was given. This
-- migration adds the columns needed to record and query WHICH actor
-- actually redeemed a pickup, alongside the existing (soft-referenced,
-- non-FK — "intentionally not a foreign key, matching the brief", per its
-- own comment) redeemedByMerchantUserId column.
--
-- redeemedByActorType reuses the EXISTING PrincipalType enum (CONSUMER/
-- MERCHANT/ADMIN) rather than a new one — a reservation can only ever be
-- redeemed by CONSUMER or MERCHANT in practice (the application layer is
-- the enforcement for that, same as every other PrincipalType use in this
-- schema), but the enum already exists and models exactly this "which
-- kind of principal did this" concept (see RefreshToken.principalType),
-- so reusing it avoids a redundant near-duplicate type.
--
-- Both new columns are NULLABLE with no DEFAULT — safe to add to this
-- non-empty, heavily-used table with no NOT NULL to backfill for. The
-- UPDATE below is a consistency fill, not a safety requirement: every
-- reservation already REDEEMED before this migration was necessarily
-- redeemed via the merchant path (the only one that ever existed), so
-- redeemedByActorType is set to 'MERCHANT' for exactly those rows —
-- keeping the new discriminator meaningful for historical data instead of
-- leaving every past redemption looking indistinguishable from "unknown."
ALTER TABLE "reservations" ADD COLUMN "redeemedByActorType" "PrincipalType";
ALTER TABLE "reservations" ADD COLUMN "redeemedByUserId" TEXT;

UPDATE "reservations"
SET "redeemedByActorType" = 'MERCHANT'
WHERE "redeemedAt" IS NOT NULL;
