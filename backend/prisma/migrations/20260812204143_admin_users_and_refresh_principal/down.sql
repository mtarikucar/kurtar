-- Down migration for 20260812204143_admin_users_and_refresh_principal.
--
-- Reverses every object the sibling migration.sql created, in reverse
-- order. Every statement is IF EXISTS, so this is safe to re-run.
--
-- Note on "ALTER COLUMN userId SET NOT NULL": this is the one narrowing
-- step in this file and is the honest inverse of the up migration's "DROP
-- NOT NULL" — but narrowing a column back to NOT NULL is data-dependent by
-- nature: it fails loudly (a normal Postgres error, no partial/silent
-- change — the whole ALTER TABLE statement is atomic) if any MERCHANT/ADMIN
-- refresh_tokens rows exist (their userId is legitimately NULL). That is
-- the correct behavior here, not a bug: this migration must never silently
-- destroy or reinterpret real MERCHANT/ADMIN session data to force the
-- rollback through. An operator rolling back after those actor types have
-- live sessions needs to first decide what to do with those rows (e.g.
-- force-logout MERCHANT/ADMIN sessions) — this file will not guess for
-- them. Immediately after `up` (this migration's own round-trip
-- verification, and the common case of "rolled out, found a problem,
-- rolling back the same day with no new MERCHANT/ADMIN logins yet"), no
-- such rows exist and this statement succeeds cleanly.

-- Drop the multi-principal CHECK first (references the columns below).
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_exactly_one_principal";

-- Drop the two new indexes.
DROP INDEX IF EXISTS "refresh_tokens_adminUserId_idx";
DROP INDEX IF EXISTS "refresh_tokens_merchantUserId_idx";

-- Drop the two new FKs.
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_adminUserId_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_merchantUserId_fkey";

-- Drop the two new principal FK columns.
ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "adminUserId";
ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "merchantUserId";

-- Restore userId's NOT NULL (see note above).
ALTER TABLE "refresh_tokens" ALTER COLUMN "userId" SET NOT NULL;

-- Drop the discriminator column, then its enum type.
ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "principalType";
DROP TYPE IF EXISTS "PrincipalType";

-- Drop admin_users last (nothing above depends on it once the FK is gone).
DROP TABLE IF EXISTS "admin_users";
