-- Reverses 20260815200000_social_trust_and_moderation/migration.sql.
-- IF EXISTS / IF NOT EXISTS throughout so this is safe to re-run and a
-- clean no-op if already reverted.

-- content_reports
ALTER TABLE "content_reports"
  DROP COLUMN IF EXISTS "resolvedAt",
  DROP COLUMN IF EXISTS "takedownWarningSentAt",
  DROP COLUMN IF EXISTS "takedownBreachedSentAt";

-- complaint_messages (drops its own FK + index with it)
DROP TABLE IF EXISTS "complaint_messages";

-- complaint_tickets
ALTER TABLE "complaint_tickets" DROP COLUMN IF EXISTS "slaWarningSentAt";
ALTER TABLE "complaint_tickets" DROP COLUMN IF EXISTS "category";
ALTER TABLE "complaint_tickets" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "complaint_tickets" ALTER COLUMN "category" DROP DEFAULT;

DROP TYPE IF EXISTS "ComplaintCategory";

-- stores
ALTER TABLE "stores"
  DROP COLUMN IF EXISTS "avgStars",
  DROP COLUMN IF EXISTS "ratingCount";
