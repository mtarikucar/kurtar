# Operations runbook

This is the operator's reference for running kurtar in staging/production: deploying, applying migrations safely, backups, the cron inventory, reading a settlement batch, responding to a failed payout, responding to a complaint/content-report SLA alert, and the merchant kill-switch. For local development, see the root [`README.md`](../README.md).

## Deploying

Every real deploy is `tag → CI → compose pull → migrate → swap`:

1. Merge to `main` (quality-gates.yml runs on every push to `main` and every PR — it must be green).
2. Cut a release tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. `release-deploy.yml` (triggered by the tag push) runs `quality-gates.yml` again as its own blocking `quality` job — **no image is ever built from a red suite** — then builds and pushes four images to GHCR (`kurtar-api`, `kurtar-merchant-web`, `kurtar-admin-web`, `kurtar-landing`) tagged `vX.Y.Z`.
4. On the target host, `docker compose -f ops/docker-compose.prod.yml pull` (or `docker-compose.staging.yml`) with `IMAGE_TAG=vX.Y.Z` (and optionally `MERCHANT_WEB_IMAGE_TAG`/`ADMIN_WEB_IMAGE_TAG`/`LANDING_IMAGE_TAG` if pinning one surface independently).
5. **Migrations run BEFORE the api container swaps** — a one-off `docker compose run --rm api npx prisma migrate deploy` against the freshly-pulled image, gated by `scripts/db-migration-doctor.sh` (see below). A bad migration never gets a chance to serve traffic.
6. `docker compose up -d` swaps the containers.

The Expo consumer app ships separately, through EAS Build/Submit to the App Store/Play Store — it is not part of this compose-based deploy at all.

Port maps: prod uses 4750 (api) / 4754 (db) / 4755 (redis) / 4756 (merchant-web) / 4757 (admin-web) / 4758 (landing); staging is the same shifted +10 (4760.../4764...). See each compose file's own header comment for the full table and required `.env.production`/`.env.staging` variables.

## The migration doctor

`scripts/db-migration-doctor.sh <compose_file> <api_service> <postgres_container> <db_user> <db_name> [--dry-run]` is a conservative pre-flight/post-pull gate, called twice per deploy by `release-deploy.yml`:

- **Before `docker compose pull`** (`--dry-run`): "is the currently-deployed state healthy?" — resolves against the previous release's image.
- **After `docker compose pull`**: "do this release's migrations apply cleanly?" — resolves against the newly-pulled image, and (without `--dry-run`) is allowed to act.

It never blindly marks a migration as applied. What it catches:

| Situation | What the script does |
|---|---|
| **P3005** (schema not empty, no migration history) | Aborts. Prints the exact `prisma migrate resolve --applied <name>` sequence an operator must run by hand, once they've verified the existing schema really does match. |
| **Drift** (DB doesn't match the migrations folder) | Aborts. Investigate with `prisma migrate diff` before deploying. |
| **One failed migration, provably idempotent SQL** (has a `-- @doctor:idempotent verified=...` header comment, or no destructive/data-validating statements) | Auto-recovers: marks it rolled-back, re-applies, deploy proceeds. |
| **One failed migration, NOT provably safe** (destructive statements, no idempotency marker) | Aborts. Prints the manual recovery steps (inspect in `psql`, then `migrate resolve --applied` or `--rolled-back` as appropriate). |
| **Multiple failed migrations** | Aborts unconditionally — always a human call. |

If it aborts, **the deploy aborts** — that's the point. Read the printed diagnostic, do the manual step it recommends, then re-trigger the deploy.

## Backups

`scripts/backup-database.sh [staging|prod]` — verified `pg_dump` backup:

- Streams `pg_dump | gzip` straight to `backups/database/backup_<env>_<timestamp>.sql.gz` (never buffers the whole dump in memory).
- **Verifies** the result before declaring success: gzip integrity check, minimum size (1KB), and a minimum count of `CREATE TABLE/INDEX/TYPE/SEQUENCE/EXTENSION` statements (catches a truncated or connection-died-immediately dump that would otherwise "succeed" as an empty file).
- Prunes backups older than the retention window (14 days prod, 3 days staging) after each successful run.
- Exits non-zero on any failure — wire this into your scheduler (cron/systemd timer) so a failed backup is a paging alert, not a silent gap.

**Known gap** (tracked, not yet built): no automated off-site upload (rclone/S3) and no documented monthly restore drill. Both are on [`docs/launch-checklist.md`](launch-checklist.md) — do not treat a local-disk-only backup as sufficient for go-live.

### Restoring

```bash
gunzip -c backups/database/backup_prod_<timestamp>.sql.gz | docker exec -i kurtar_db_prod psql -U kurtar -d kurtar
```

Restore into a **new, empty database** first and diff row counts against production before ever pointing a live app at a restored database.

## Cron inventory

All ten crons run inside the single `api` container (NestJS's `@nestjs/schedule`, in-process — see [`docs/architecture/decisions/0002-outbox-pattern.md`](architecture/decisions/0002-outbox-pattern.md) for why this is fine at kurtar's current scale, and what to revisit if the api service is ever scaled past one replica). Every one below also has an admin-triggerable on-demand equivalent where a human might reasonably need to force a run without waiting for the schedule — noted per row.

| Cron | Schedule | What it does | If it doesn't run |
|---|---|---|---|
| **Outbox drain** (`outbox-worker.service.ts`) | every 15s | Dispatches queued domain events (emails, SMS, pushes, in-app notification fan-out) in bounded batches of 20; reclaims events stuck in `processing` past a 5-minute per-event lease (a crashed worker mid-dispatch). | Notifications (offer-published pushes, rating invites, pickup reminders' downstream email, merchant lifecycle emails) stop going out, but no data is lost — events sit `queued` until the worker resumes, then drain normally. |
| **Offers publish scheduler** (`offers-publish-scheduler.service.ts`) | every minute | Flips `SCHEDULED` offers whose `publishAt` has arrived to `PUBLISHED`. | Scheduled offers never go live on their own — merchants relying on "schedule for tomorrow evening" silently get nothing published. Visible symptom: an offer stuck in SCHEDULED past its `publishAt`. |
| **Payment sweeper** (`payments-sweeper.service.ts`) | every 5 min | Polls the payment provider for reservations stuck in `PENDING_PAYMENT`/`Payment.status IN (INTENT, PROCESSING)` — the buyer closed the tab, or the webhook never arrived — and reconciles them (confirms or expires + releases stock). | A reservation whose webhook was lost never resolves: stock stays claimed, the consumer never sees CONFIRMED or a refund. This is the self-healing backstop for the whole payment-webhook path — treat it as load-bearing, not optional. |
| **Pickup reminder sweep** (`pickup-reminder-cron.service.ts`) | every 5 min | Sends a pickup-window reminder push/notification to consumers with a `CONFIRMED` reservation whose window is approaching, in bounded batches of 200 (sentinel column `pickupReminderSentAt` guards against double-send). | Consumers stop getting pickup reminders — more no-shows, not a money-safety issue. |
| **Complaint SLA sweep** (`complaint-sla-cron.service.ts`) | hourly | Warns ops by email as a complaint approaches its 15-calendar-day ETAHS deadline; auto-escalates (`OPEN`/`MERCHANT_RESPONDED` → `ESCALATED`) on breach. | A complaint can silently blow its regulatory response deadline with no alert — see "responding to an SLA alert" below for why this matters. |
| **Content-report takedown sweep** (`moderation-takedown-cron.service.ts`) | every 30 min | Same discipline for the 48h takedown SLA on reported store/offer/rating content — warns at the 12h-remaining mark, alert-only on breach (no automatic status change; `ReportStatus` has no ESCALATED value). | A reported item can sit past its 48h takedown deadline unnoticed. |
| **Settlement nightly batch** (`settlement-batch-builder.service.ts`) | 02:00 Europe/Istanbul | Groups the day's `REDEEMED`-with-no-settlement-line reservations per merchant per day, computes each batch (`CALCULATED` or `HELD` if fees exceed gross). On-demand: `POST /api/admin/settlements/run-nightly`. | Redeemed bags never get batched for payout — merchants don't get paid. This is the entry point to the whole settlement pipeline; see "reading a settlement batch" below. |
| **Settlement payout dispatch** (`settlement-payout.service.ts`) | every 5 min | Calls the payment provider's payout API for every `APPROVED` batch, flips it to `SENT` on success. On-demand (single batch): `POST /api/admin/settlements/:id/retry`. | Approved batches never actually get paid out — money is committed (approved) but never leaves the platform. See "when a payout fails" below. |
| **Settlement reconciliation alert** (`settlement-payout.service.ts`) | 09:00 daily | Flags batches `SENT` for more than 3 days without confirming `SETTLED` (bank/PSP never confirmed receipt). | A stuck-in-SENT batch goes unnoticed — money left the platform but was never confirmed as landed. |
| **Membership renewal** (`membership-renewal-cron.service.ts`) | 03:00 daily | On a merchant's subscription anniversary, opens a new membership period at the then-current price, forgiving (and auditing) any unrecovered balance from the just-ended period. | Merchant subscriptions never roll to their next period — `currentPeriodEnd` stays stale and the offset engine has nothing current to recover against. |

## Reading a settlement batch

A batch (`GET /api/admin/settlements/:id` in admin-web's Finans → detail view) moves through this lifecycle: **PENDING → CALCULATED → APPROVED → SENT → SETTLED**, with **HELD** as a side branch from CALCULATED/APPROVED/retry whenever the arithmetic can't be satisfied.

The breakdown, top to bottom, in deduction order (see [`docs/architecture/decisions/0003-settlement-ledger.md`](architecture/decisions/0003-settlement-ledger.md) for the full design rationale):

```
grossCents                         (sum of redeemed reservations' totalCents)
- bagFeeCents                      (fixed ₺ per bag × qty, NOT a percentage)
- bagFeeVatCents                   (%20 KDV on the bag fee)
- withholdingCents                 (%1 stopaj on gross minus the platform's own fee+KDV — GVK md.94/Law 7524; MALI MÜŞAVİR SIGN-OFF REQUIRED, see launch checklist)
- membershipOffsetCents            (debt collection against the merchant's annual membership fee, capped by what's owed and what's left)
- membershipOffsetVatCents
- refundClawbackCents              (money to recover from a refund on an already-settled reservation)
= netPayoutCents                   (never negative — a shortfall becomes carriedShortfallCents and the batch goes HELD)
```

If `holdReason` is set, read it — it's a human-readable sentence, not a code. A batch's `settlementLines` (one per redeemed reservation) and `commissionInvoices` (the e-document issued for the bag fee) are on the same detail response.

## When a payout fails

1. Check the batch's status. `APPROVED` with no `pspTransferRef` after several payout-dispatch ticks (every 5 min) means the provider call is failing or hasn't been attempted yet.
2. Click **Tekrar dene** (retry) on the batch detail page, or `POST /api/admin/settlements/:id/retry` — this re-attempts the SAME payout (idempotent by the batch id as the provider-side idempotency key; `payoutAttemptedAt` freezes `netPayoutCents` the instant the first attempt is made, so a retry can never pay a different amount than what was first attempted).
3. If retries keep failing, the provider is the next thing to check (credentials, sub-merchant onboarding status, account balance) — not the batch's own arithmetic, which is frozen once `payoutAttemptedAt` is set.
4. A batch `SENT` for more than 3 days without reaching `SETTLED` surfaces on the 09:00 daily reconciliation sweep — treat that as "confirm with the PSP/bank directly," not "retry again."

## Responding to a complaint SLA alert

The complaint-SLA email (from `complaint-sla-cron.service.ts`, sent to `OPS_ALERT_EMAIL`) fires once, at the 48-hours-remaining mark on a 15-calendar-day ETAHS response window. On receipt:

1. Open the complaint in admin-web (Şikayetler) or `GET /api/admin/complaints/:id`.
2. If it's genuinely unresolved, get a merchant response or resolve it directly before the deadline — a breach auto-escalates the ticket (`ESCALATED`) but does **not** stop the regulatory clock.
3. If the deadline passes anyway, the ticket is now `ESCALATED` and logged at `error` level regardless of whether the email was configured — this is deliberately never silent, even without `OPS_ALERT_EMAIL` set.

The content-report takedown alert (12h-remaining mark on a 48h window) works the same way, except a breach is alert-only — there's no automatic status change to fall back on, so a breached report needs a human to actually act on it (action or dismiss).

## The merchant kill-switch (suspend) — blast radius

`POST /api/admin/merchants/:id/suspend` (admin-web: İşletme onayları → suspend action) is immediate and has real, irreversible-in-part consequences:

1. The merchant's `verificationStatus` flips to `SUSPENDED` in one small transaction.
2. **Every active offer across every one of the merchant's stores is cancelled** (the same code path as a merchant self-cancelling an offer) — every reservation against those offers gets refunded through the normal refund fan-out.
3. The merchant instantly disappears from every discovery surface (`discovery.service.ts` filters `verificationStatus = 'APPROVED'` in all three query paths) and can no longer authenticate any write path (`MerchantApprovalGuard` default-denies a non-APPROVED merchant everywhere except the exempted read-only/redeem/onboarding routes).
4. The response includes `offersCancelled` — the only real, non-fabricated count of blast radius; there is no "preview before you click" endpoint, so **know this will happen before you click it**, not after.
5. What suspend does **not** do: it doesn't touch historical settlement batches (a SETTLED/SENT batch is unaffected), and it doesn't delete the merchant's data — re-approving (`POST /api/admin/merchants/:id/approve` from SUSPENDED) restores write access, but does not un-cancel the offers/reservations that were already cancelled.

Use suspend for "this merchant needs to stop transacting right now" (a safety complaint, a fraud signal, a legal request) — not as a routine pause. There is currently no separate "temporarily hide, no cancellation" toggle.

## End-to-end test

`e2e/tests/money-loop.spec.ts` (Playwright) proves the full money loop — consumer discovery → reserve → mock PSP webhook → CONFIRMED → merchant-web pickup list → redeem → rating → nightly settlement batch → admin-web approve → retry/payout dispatch → SENT — against a real backend, a real ephemeral Postgres/PostGIS + Redis, and the **built** merchant-web/admin-web (not dev servers). The consumer side is driven through the real API directly (no mocks) rather than a browser, since the Expo app has no browser E2E surface — see that file's own doc comment, and `apps/consumer`'s own jest + React Native Testing Library suite for consumer-side UI coverage instead.

Wired into CI as its own job (`e2e-money-loop` in `.github/workflows/quality-gates.yml`), running on every PR and push to `main`. It is not part of any local `npm test` default — run it explicitly:

```bash
cd e2e
npx playwright install --with-deps chromium   # once
E2E_BACKEND_LOG_FILE=/path/to/backend/stdout.log npx playwright test
```

It needs the backend + merchant-web + admin-web already running (`./scripts/dev-up.sh` covers this) and `npm run seed:demo -w backend` already applied, plus `E2E_BACKEND_LOG_FILE` pointed at wherever the backend's stdout is going — the mock SMS provider logs the consumer's OTP code there in the clear (by design: never echoed in the HTTP response, see `backend/src/modules/otp/otp.service.ts`), and reading it from the log is the only way this test — or a human running the same manual flow — ever learns it. Runtime: ~20 seconds for the test itself.
