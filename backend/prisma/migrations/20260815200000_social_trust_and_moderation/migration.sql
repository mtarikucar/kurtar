-- Task 9: social/trust layer (favorites, ratings, impact) + complaints SLA
-- + content-report takedown — schema additions over models Task 2 already
-- created but left unused (Rating/Favorite/ImpactLedger/ComplaintTicket/
-- ContentReport/AuditLog). All three tables this migration reshapes
-- (ratings, complaint_tickets, content_reports) are empty in every
-- environment this has run in (verified: `SELECT count(*)` on each was 0
-- immediately before writing this migration) — safe to reshape a column's
-- TYPE outright rather than needing a backfill/USING-cast migration.
--
-- 1. stores.avgStars / ratingCount — denormalized rating aggregate so a
--    store profile read never runs a live aggregate query. Maintained by
--    modules/ratings' recomputeStoreAggregate, inside the SAME transaction
--    as every rating create/approve/reject/delete (never per-request).
--
-- 2. ComplaintCategory (new enum) — complaint_tickets.category goes from
--    free-text to a fixed, reviewable set ("categories enum'd" per brief).
--
-- 3. complaint_tickets.slaWarningSentAt — idempotency sentinel for the
--    SLA cron's "approaching deadline" admin alert (mirrors
--    reservations.pickupReminderSentAt's established pattern).
--
-- 4. complaint_messages (new table) — the complaint message thread
--    (consumer / merchant / admin), a soft actor reference (authorType +
--    authorId) matching MerchantVerificationEvent.actorAdminId's
--    precedent, since the author can be any of three separate principal
--    tables.
--
-- 5. content_reports.resolvedAt / takedownWarningSentAt /
--    takedownBreachedSentAt — resolvedAt mirrors ComplaintTicket's own
--    field; the two warning sentinels exist because ReportStatus (unlike
--    ComplaintStatus) has no ESCALATED value, so a report's 48h breach is
--    alert-only and needs its own idempotency sentinel, separate from the
--    "approaching" one.

-- AlterTable: stores — denormalized rating aggregate
ALTER TABLE "stores"
  ADD COLUMN "avgStars" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum: ComplaintCategory
CREATE TYPE "ComplaintCategory" AS ENUM (
  'FOOD_QUALITY',
  'MISSING_ITEMS',
  'WRONG_ITEMS',
  'STORE_CLOSED_NO_SHOW',
  'RUDE_STAFF',
  'PAYMENT_BILLING',
  'SAFETY_HYGIENE',
  'OTHER'
);

-- AlterTable: complaint_tickets — category TEXT -> ComplaintCategory enum
-- (table verified empty — see header), + the SLA-warning sentinel.
ALTER TABLE "complaint_tickets" DROP COLUMN "category";
ALTER TABLE "complaint_tickets" ADD COLUMN "category" "ComplaintCategory" NOT NULL;
ALTER TABLE "complaint_tickets" ADD COLUMN "slaWarningSentAt" TIMESTAMP(3);

-- CreateTable: complaint_messages
CREATE TABLE "complaint_messages" (
  "id" TEXT NOT NULL,
  "complaintId" TEXT NOT NULL,
  "authorType" "PrincipalType" NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "complaint_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "complaint_messages_complaintId_createdAt_idx"
  ON "complaint_messages"("complaintId", "createdAt");

ALTER TABLE "complaint_messages"
  ADD CONSTRAINT "complaint_messages_complaintId_fkey"
  FOREIGN KEY ("complaintId") REFERENCES "complaint_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: content_reports
ALTER TABLE "content_reports"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "takedownWarningSentAt" TIMESTAMP(3),
  ADD COLUMN "takedownBreachedSentAt" TIMESTAMP(3);
