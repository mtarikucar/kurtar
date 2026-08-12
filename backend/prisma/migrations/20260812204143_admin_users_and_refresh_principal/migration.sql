-- Task 3: admin_users table + refresh_tokens multi-principal adaptation.
--
-- kds's RefreshToken (and kurtar's Task-2 port of it) is User-only: one
-- actor type. kurtar's auth issues tokens for three actor types (CONSUMER
-- via User, MERCHANT via MerchantUser, ADMIN via the new AdminUser below),
-- so a single refresh_tokens row must be able to belong to any one of the
-- three. See schema.prisma's RefreshToken doc comment for the full story;
-- this migration is the DDL side of that adaptation.

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('CONSUMER', 'MERCHANT', 'ADMIN');

-- AlterTable: discriminate refresh_tokens by principal type. Existing rows
-- (if any — none in practice, this is the first migration to touch the
-- table since Task 2's init) are all CONSUMER (User) rows, so the interim
-- DEFAULT backfills them correctly before being dropped so future inserts
-- must specify it explicitly.
ALTER TABLE "refresh_tokens" ADD COLUMN "principalType" "PrincipalType" NOT NULL DEFAULT 'CONSUMER';
ALTER TABLE "refresh_tokens" ALTER COLUMN "principalType" DROP DEFAULT;

-- AlterTable: userId now optional (MERCHANT/ADMIN rows carry NULL here).
ALTER TABLE "refresh_tokens" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable: the two new principal FKs.
ALTER TABLE "refresh_tokens" ADD COLUMN "merchantUserId" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "adminUserId" TEXT;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "merchant_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "refresh_tokens_merchantUserId_idx" ON "refresh_tokens"("merchantUserId");

-- CreateIndex
CREATE INDEX "refresh_tokens_adminUserId_idx" ON "refresh_tokens"("adminUserId");

-- Hand-edited: exactly one principal FK must be set, and it must be the one
-- principalType names — a row can never point at two principals at once, or
-- none. Prisma's DSL cannot express multi-column CHECK constraints (same
-- reason Task 2's daily_offers bounds were hand-written). Wrapped in a DO
-- block with a pg_constraint existence check so this file stays idempotent
-- if it is ever re-run by hand.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_exactly_one_principal'
  ) THEN
    ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "refresh_tokens_exactly_one_principal"
      CHECK (
        ("principalType" = 'CONSUMER' AND "userId" IS NOT NULL AND "merchantUserId" IS NULL AND "adminUserId" IS NULL) OR
        ("principalType" = 'MERCHANT' AND "userId" IS NULL AND "merchantUserId" IS NOT NULL AND "adminUserId" IS NULL) OR
        ("principalType" = 'ADMIN' AND "userId" IS NULL AND "merchantUserId" IS NULL AND "adminUserId" IS NOT NULL)
      );
  END IF;
END $$;
