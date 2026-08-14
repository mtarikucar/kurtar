-- Hand-edited (Task 2): enable PostGIS before any geography column is
-- created. Idempotent — safe to re-run.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "MerchantVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MerchantUserRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BagCategory" AS ENUM ('MEAL', 'BAKERY', 'GROCERY', 'PRODUCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DietFlag" AS ENUM ('VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'LACTOSE_FREE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'SOLD_OUT', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'REDEEMED', 'CANCELLED_BY_USER', 'CANCELLED_BY_MERCHANT', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('IYZICO', 'PAYTR', 'MOCK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INTENT', 'PROCESSING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('USER_CANCEL', 'MERCHANT_CANCEL', 'ADMIN', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DONE');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'SENT', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('BAG_FEE', 'MEMBERSHIP');

-- CreateEnum
CREATE TYPE "EDocType" AS ENUM ('EFATURA', 'EARSIVFATURA');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'MERCHANT_RESPONDED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('STORE', 'OFFER', 'RATING');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "name" TEXT,
    "email" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'tr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoritesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nearbyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nearbyRadiusM" INTEGER NOT NULL DEFAULT 3000,
    "marketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "mersisNo" TEXT,
    "kepAddress" TEXT,
    "iban" TEXT NOT NULL,
    "verificationStatus" "MerchantVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "verifiedAt" TIMESTAMP(3),
    "nextReverifyAt" TIMESTAMP(3),
    "pspSubMerchantKey" TEXT,
    "pspOnboardingStatus" TEXT,
    "foodInspectionQrUrl" TEXT,
    "sttAttestationAcceptedAt" TIMESTAMP(3),
    "intermediationContractVersion" TEXT,
    "intermediationAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_users" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "MerchantUserRole" NOT NULL DEFAULT 'OWNER',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_verification_events" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "fromStatus" "MerchantVerificationStatus" NOT NULL,
    "toStatus" "MerchantVerificationStatus" NOT NULL,
    "actorAdminId" TEXT,
    "note" TEXT,
    "docsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_subscriptions" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'TRIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "coverImageUrl" TEXT,
    "categoryTags" "BagCategory"[],
    "openingHoursJson" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bag_templates" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "BagCategory" NOT NULL,
    "dietFlags" "DietFlag"[],
    "allergenDisclaimer" TEXT NOT NULL,
    "originalValueCentsMin" INTEGER NOT NULL,
    "originalValueCentsMax" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bag_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_offers" (
    "id" TEXT NOT NULL,
    "bagTemplateId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "offerDate" DATE NOT NULL,
    "qtyTotal" INTEGER NOT NULL,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "qtyRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pickupStartAt" TIMESTAMP(3) NOT NULL,
    "pickupEndAt" TIMESTAMP(3) NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "cancelDeadlineAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByMerchantUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "merchantOid" TEXT NOT NULL,
    "pspPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INTENT',
    "idempotencyKey" TEXT NOT NULL,
    "rawWebhookJson" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "pspRefundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event_logs" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_batches" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "bagFeeCents" INTEGER NOT NULL DEFAULT 0,
    "withholdingCents" INTEGER NOT NULL DEFAULT 0,
    "membershipOffsetCents" INTEGER NOT NULL DEFAULT 0,
    "refundClawbackCents" INTEGER NOT NULL DEFAULT 0,
    "netPayoutCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "pspTransferRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "bagFeeCents" INTEGER NOT NULL,
    "withholdingCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoices" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "InvoiceType" NOT NULL,
    "docType" "EDocType" NOT NULL,
    "nilveraDocId" TEXT,
    "ublXmlRef" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "overallStars" INTEGER NOT NULL,
    "foodQuality" INTEGER,
    "service" INTEGER,
    "comment" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_ledgers" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "mealsSaved" INTEGER NOT NULL,
    "co2eGrams" INTEGER NOT NULL,
    "moneySavedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impact_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT,
    "reservationId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "slaDeadlineAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "takedownDeadlineAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diffJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneE164_key" ON "users"("phoneE164");

-- CreateIndex
CREATE INDEX "phone_otps_phoneE164_createdAt_idx" ON "phone_otps"("phoneE164", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_expoPushToken_key" ON "push_tokens"("expoPushToken");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "merchants_verificationStatus_idx" ON "merchants"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_users_email_key" ON "merchant_users"("email");

-- CreateIndex
CREATE INDEX "stores_city_active_idx" ON "stores"("city", "active");

-- Hand-edited (Task 2): spatial GIST index for the "nearby stores" query
-- (ST_DWithin against stores.location). Idempotent.
CREATE INDEX IF NOT EXISTS "store_location_gist" ON "stores" USING GIST ("location");

-- CreateIndex
CREATE INDEX "daily_offers_status_pickupEndAt_idx" ON "daily_offers"("status", "pickupEndAt");

-- CreateIndex
CREATE INDEX "daily_offers_storeId_offerDate_idx" ON "daily_offers"("storeId", "offerDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_offers_bagTemplateId_offerDate_key" ON "daily_offers"("bagTemplateId", "offerDate");

-- Hand-edited (Task 2): keep the reserved/redeemed counters inside their
-- physical bounds at the DB layer (defense in depth for the atomic
-- reserve/redeem write path built in Task 4). Named explicitly; wrapped in
-- a DO block with a pg_constraint existence check so this migration file
-- stays idempotent if it is ever re-run by hand.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_offers_qty_reserved_non_negative'
  ) THEN
    ALTER TABLE "daily_offers"
      ADD CONSTRAINT "daily_offers_qty_reserved_non_negative"
      CHECK ("qtyReserved" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_offers_qty_reserved_within_total'
  ) THEN
    ALTER TABLE "daily_offers"
      ADD CONSTRAINT "daily_offers_qty_reserved_within_total"
      CHECK ("qtyReserved" <= "qtyTotal");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_offers_qty_redeemed_non_negative'
  ) THEN
    ALTER TABLE "daily_offers"
      ADD CONSTRAINT "daily_offers_qty_redeemed_non_negative"
      CHECK ("qtyRedeemed" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_offers_qty_redeemed_within_reserved'
  ) THEN
    ALTER TABLE "daily_offers"
      ADD CONSTRAINT "daily_offers_qty_redeemed_within_reserved"
      CHECK ("qtyRedeemed" <= "qtyReserved");
  END IF;
END $$;

-- Hand-edited (Task 2): partial index for the "what's still publicly
-- buyable" hot path (published offers ordered by pickup window close).
-- Idempotent.
CREATE INDEX IF NOT EXISTS "daily_offers_published_idx" ON "daily_offers" ("pickupEndAt") WHERE "status" = 'PUBLISHED';

-- CreateIndex
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");

-- CreateIndex
CREATE INDEX "reservations_userId_createdAt_idx" ON "reservations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reservations_offerId_status_idx" ON "reservations"("offerId", "status");

-- CreateIndex
CREATE INDEX "reservations_status_cancelDeadlineAt_idx" ON "reservations"("status", "cancelDeadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservationId_key" ON "payments"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_merchantOid_key" ON "payments"("merchantOid");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_logs_externalEventId_key" ON "webhook_event_logs"("externalEventId");

-- CreateIndex
CREATE INDEX "settlement_batches_merchantId_status_idx" ON "settlement_batches"("merchantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_lines_reservationId_key" ON "settlement_lines"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_reservationId_key" ON "ratings"("reservationId");

-- CreateIndex
CREATE INDEX "ratings_storeId_moderationStatus_idx" ON "ratings"("storeId", "moderationStatus");

-- CreateIndex
CREATE INDEX "favorites_storeId_idx" ON "favorites"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_storeId_key" ON "favorites"("userId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "impact_ledgers_reservationId_key" ON "impact_ledgers"("reservationId");

-- CreateIndex
CREATE INDEX "complaint_tickets_status_slaDeadlineAt_idx" ON "complaint_tickets"("status", "slaDeadlineAt");

-- CreateIndex
CREATE INDEX "content_reports_status_takedownDeadlineAt_idx" ON "content_reports"("status", "takedownDeadlineAt");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_events_type_createdAt_idx" ON "outbox_events"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_date_key" ON "public_holidays"("date");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_verification_events" ADD CONSTRAINT "merchant_verification_events_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_subscriptions" ADD CONSTRAINT "membership_subscriptions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_templates" ADD CONSTRAINT "bag_templates_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_offers" ADD CONSTRAINT "daily_offers_bagTemplateId_fkey" FOREIGN KEY ("bagTemplateId") REFERENCES "bag_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_offers" ADD CONSTRAINT "daily_offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "daily_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_ledgers" ADD CONSTRAINT "impact_ledgers_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_ledgers" ADD CONSTRAINT "impact_ledgers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_ledgers" ADD CONSTRAINT "impact_ledgers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_tickets" ADD CONSTRAINT "complaint_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_tickets" ADD CONSTRAINT "complaint_tickets_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_tickets" ADD CONSTRAINT "complaint_tickets_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

