-- Down migration for 20260812171242_init.
--
-- Reverses every object the sibling migration.sql created: tables (which
-- cascade-drops their own indexes, CHECK constraints and FKs) and enum
-- types. Order is a manual reverse topological sort of the FK graph
-- (children dropped before the parents they reference) so no explicit
-- CASCADE is needed and nothing beyond what `up` created is touched. Every
-- statement is IF EXISTS, so this is safe to re-run.
--
-- Extension: deliberately NOT dropping postgis, even though this is a
-- dedicated per-service database (ops/docker-compose.yml `db` service)
-- where that would otherwise be acceptable. The postgis/postgis Docker
-- image provisions postgis_topology and postgis_tiger_geocoder in every
-- database at container init time (verified against postgis/postgis:16-3.4
-- — see `SELECT extname FROM pg_extension`), and both depend on postgis.
-- `up` only ever ran `CREATE EXTENSION IF NOT EXISTS postgis` (a no-op
-- against that pre-provisioned extension); it never created those other
-- two. Dropping postgis here would require CASCADE, which would remove
-- extensions this migration does not own — a bigger blast radius than
-- "drop exactly what up created". If this project ever manages its own
-- Postgres image (no bundled topology/tiger extensions), revisit this.

-- Tier 1: leaf tables (nothing else references them).
DROP TABLE IF EXISTS "refunds";
DROP TABLE IF EXISTS "favorites";
DROP TABLE IF EXISTS "ratings";
DROP TABLE IF EXISTS "complaint_tickets";
DROP TABLE IF EXISTS "settlement_lines";
DROP TABLE IF EXISTS "commission_invoices";
DROP TABLE IF EXISTS "webhook_event_logs";
DROP TABLE IF EXISTS "content_reports";
DROP TABLE IF EXISTS "outbox_events";
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "public_holidays";
DROP TABLE IF EXISTS "phone_otps";
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "push_tokens";
DROP TABLE IF EXISTS "notification_preferences";
DROP TABLE IF EXISTS "merchant_users";
DROP TABLE IF EXISTS "merchant_verification_events";
DROP TABLE IF EXISTS "membership_subscriptions";
DROP TABLE IF EXISTS "impact_ledgers";

-- Tier 2: safe once tier 1 is gone.
DROP TABLE IF EXISTS "payments";
DROP TABLE IF EXISTS "settlement_batches";

-- Tier 3.
DROP TABLE IF EXISTS "reservations";

-- Tier 4.
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "daily_offers";

-- Tier 5.
DROP TABLE IF EXISTS "bag_templates";

-- Tier 6.
DROP TABLE IF EXISTS "stores";

-- Tier 7: root of the merchant subgraph.
DROP TABLE IF EXISTS "merchants";

-- Enum types (safe now that every table using them is gone).
DROP TYPE IF EXISTS "ModerationStatus";
DROP TYPE IF EXISTS "Platform";
DROP TYPE IF EXISTS "ReportStatus";
DROP TYPE IF EXISTS "ReportTargetType";
DROP TYPE IF EXISTS "ComplaintStatus";
DROP TYPE IF EXISTS "InvoiceStatus";
DROP TYPE IF EXISTS "EDocType";
DROP TYPE IF EXISTS "InvoiceType";
DROP TYPE IF EXISTS "SettlementStatus";
DROP TYPE IF EXISTS "RefundStatus";
DROP TYPE IF EXISTS "RefundReason";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "PaymentProvider";
DROP TYPE IF EXISTS "ReservationStatus";
DROP TYPE IF EXISTS "OfferStatus";
DROP TYPE IF EXISTS "DietFlag";
DROP TYPE IF EXISTS "BagCategory";
DROP TYPE IF EXISTS "MembershipStatus";
DROP TYPE IF EXISTS "MerchantUserRole";
DROP TYPE IF EXISTS "MerchantVerificationStatus";
DROP TYPE IF EXISTS "UserStatus";

-- postgis extension intentionally left in place — see note at the top of
-- this file.
