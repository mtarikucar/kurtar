-- Task 9: social/trust layer (favorites, ratings, impact) + complaints SLA
-- + content-report takedown — schema additions over models Task 2 already
-- created but left unused (Rating/Favorite/ImpactLedger/ComplaintTicket/
-- ContentReport/AuditLog). complaint_tickets and content_reports are empty
-- in every environment this has run in (verified: `SELECT count(*)` on
-- each was 0 immediately before writing this migration) — Task 9 is the
-- first task with any write path to either. `ratings` is NOT reshaped by
-- this migration (only `stores` gains the two new denormalized columns) —
-- see fix-round correction below for why it still needs a backfill.
--
-- 1. stores.avgStars / ratingCount — denormalized rating aggregate so a
--    store profile read never runs a live aggregate query. Maintained by
--    modules/ratings' recomputeStoreAggregate, inside the SAME transaction
--    as every rating create/approve/reject/delete (never per-request).
--    [Fix round, Important 7] Backfilled below from any ratings that
--    already exist at migration time — the DEFAULT 0 alone is only safe
--    for a genuinely empty `ratings` table (true everywhere this has
--    actually run), not a correct migration artifact in general; the
--    backfill closes that regardless of when/where this runs.
--
-- 2. ComplaintCategory (new enum) — complaint_tickets.category goes from
--    free-text to a fixed, reviewable set ("categories enum'd" per brief).
--    [Fix round, Important 7] The new column now carries an explicit
--    DEFAULT ('OTHER') rather than a bare NOT NULL — a bare NOT NULL ADD
--    COLUMN hard-fails outright against ANY non-empty table (Postgres has
--    no row to backfill from), so the original statement here was only
--    ever safe because `complaint_tickets` happened to be empty in every
--    environment this migration has actually run against — not because
--    the SQL itself was correct as a standalone artifact. The DEFAULT
--    makes it correct unconditionally; the application always writes a
--    real category on every create() (ratings.service.ts-equivalent
--    complaints.service.ts), so 'OTHER' is never actually relied upon in
--    practice, purely a defensive fallback.
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

-- [Fix round, Important 7] Backfill from any ratings that already exist —
-- a no-op (0 rows touched) everywhere this has actually run so far, but a
-- genuinely correct statement for any environment where it isn't. Mirrors
-- ratings.service.ts's own recomputeStoreAggregate exactly (AVG/COUNT
-- over the APPROVED subset per store).
UPDATE "stores" s
SET "avgStars" = agg."avgStars", "ratingCount" = agg."ratingCount"
FROM (
  SELECT "storeId", AVG("overallStars") AS "avgStars", COUNT(*) AS "ratingCount"
  FROM "ratings"
  WHERE "moderationStatus" = 'APPROVED'
  GROUP BY "storeId"
) agg
WHERE s."id" = agg."storeId";

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
-- + the SLA-warning sentinel. [Fix round, Important 7] A TEMPORARY
-- DEFAULT 'OTHER' makes ADD COLUMN safe against a non-empty table
-- (backfills every existing row), then is immediately dropped —
-- schema.prisma's own `category ComplaintCategory` field declares no
-- @default, so leaving the DEFAULT in place would diverge the live DB
-- from the Prisma schema (caught by re-running `prisma migrate diff`
-- after this fix: it wanted `ALTER COLUMN category DROP DEFAULT`). The
-- application always sets category explicitly on every create(), so no
-- code path ever actually relies on the default either way — this is a
-- pure ADD-COLUMN safety mechanism, not a real default value.
ALTER TABLE "complaint_tickets" DROP COLUMN "category";
ALTER TABLE "complaint_tickets" ADD COLUMN "category" "ComplaintCategory" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "complaint_tickets" ALTER COLUMN "category" DROP DEFAULT;
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
