# Final review — bulgular (bloklayıcı tur sonrası kalanlar)

Kaynak: 7 boyutlu final whole-branch review. Bloklayıcı tur (Wave 2 main e merge edilmeden önce) 15 bulguyu kapattı; aşağıdakiler kalan 47 bulgu.

**ÖNEMLİ:** bu liste bloklayıcı tur ÖNCESİNDEKİ koda göre yazıldı. O turda 12 commit indi, dolayısıyla bazıları kendiliğinden kapanmış olabilir. Her biri güncel koda karşı yeniden doğrulanmalı.

---

## CRITICAL (2)

### C1 — Extending a HELD batch after a successor's payout was sent orphans the new settlement lines permanently — merchant is never paid for them

**Konum:** `backend/src/modules/settlements/settlement-batch-builder.service.ts:330`

`createOrExtendBatch` commits new `settlement_lines` rows in its OWN statement (line 489, `this.prisma.settlementLine.createMany`, outside any transaction shared with the recompute), and only then does `recomputeBatch` run in a separate transaction (lines 331-338). `createOrExtendBatch` deliberately extends a HELD batch (line 450, `RECOMPUTABLE_SETTLEMENT_STATUSES`). But `assertIrrevocableClaimsHonoured` (line 1237) throws `SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED` and rolls the recompute back whenever adding those lines shrinks the batch's exportable demand below what an already-SENT successor claimed from it.

Failure scenario, exactly as the branch's own spec builds it (settlements.realdb.spec.ts:2207-2306): merchant has bagFee 20000; day-1 reservation gross 20000 → batch A goes HELD exporting 4000-ish. Day-3 batch B claims that demand, is approved and paid out (SENT). A very-late day-1 redemption of gross 100000 then arrives. `createOrExtendBatch` inserts its settlement line into batch A and COMMITS it; `recomputeBatch(A)` then throws and rolls back. The spec asserts `refusedA1.grossCents` is still 20000 (line 2292) while `settlement_lines` for that batch now sum to 120000 — the batch ledger and the line ledger are inconsistent on disk, and nothing will ever fix it:
  - the nightly eligibility scan excludes the reservation forever (`settlementLine: null`, line 248);
  - the clawback-only sweep builds a batch for TODAY's dayKey (line 366-371), never for A's `periodStart`, so A is never revisited;
  - `adminApprove(A)` and `adminRetry(A)` both call `recomputeBatch`, which throws the same 409 every time;
  - there is no writer anywhere that can delete or re-point a `SettlementLine` (grep: only `createMany` at :489 and two column updates at :705/:847).

So the merchant permanently loses the net payout on that 100000 line (~74k kuruş here), batch A is wedged HELD forever, and every subsequent nightly cycle logs one more failure entry for that merchant. The class doc "parks" the refusal as needing manual reconciliation of the *difference* — but the orphaned-lines consequence is a strictly larger, unacknowledged loss, and manual reconciliation has no SQL-free path to fix it. This is also reachable without any late redemption at all: an admin lowering `merchant.bagFeeCentsOverride` shrinks A's fee deficit the same way (pricing.service.ts:60 — the override is not date-scoped, so it retroactively re-derives every recomputable batch).

**Önerilen düzeltme:** Either (a) insert the settlement lines inside the same transaction as `recomputeBatch` so a refusal rolls the lines back too and the reservations stay eligible for the next cycle, or (b) when `assertIrrevocableClaimsHonoured` would fire, do not extend the source batch at all — route the late lines to a fresh batch for that merchant+day (the source batch is already `HELD`/frozen in practice), and record the un-exportable difference as an explicit reconciliation row rather than refusing the whole recompute.

### C2 — Commission invoicing is not idempotent while the outbox is at-least-once — a redelivery issues a second real e-fatura for the same batch

**Konum:** `backend/src/modules/invoicing/commission-invoice.service.ts:147`

`createInvoicesForSentBatch` unconditionally calls `commissionInvoice.create()` (line 147) with no existence check, and `CommissionInvoice` has no unique constraint on `(batchId, type)` (schema.prisma:1098-1132; the init migration creates only the PK and two FKs). The provider-level idempotency key is `CommissionInvoice.id` (e-document-provider.interface.ts:18-22, mock-e-document-provider.ts:35-37) — a cuid minted fresh on every handler run, so it cannot dedupe a re-run.

The outbox is explicitly at-least-once. Two concrete redelivery paths:
1. `createAndIssue` for BAG_FEE succeeds (row created, `facade.issue` called, real e-document issued), then the MEMBERSHIP branch's `commissionInvoice.create` hits a transient DB error. The handler throws → `markRetry` (outbox-worker.service.ts:291) → next tick re-runs `createInvoicesForSentBatch` from the top → a SECOND BAG_FEE `CommissionInvoice` row is created with a new id and `facade.issue` is called again → a second legally-issued invoice to the merchant for the same bag fees.
2. The handler fully succeeds but `markDone` fails; outbox-worker.service.ts:295-313 deliberately leaves the row PROCESSING for a stale-lease reclaim and calls the resulting duplicate dispatch "a rare, bounded duplicate" — acceptable for a push notification, not for a tax document.

Separately, within `createAndIssue` the post-issue `commissionInvoice.update` (line 170) sits INSIDE the same `try` as `facade.issue`. If issuance succeeded and only that update failed, the catch logs "drafted but issuance failed — left DRAFT for manual/future retry" (line 179) — the exact opposite of the truth, and an invitation for an operator to re-issue an already-issued e-fatura. This is the same money/bookkeeping split `refundForCancellation` (reservations.service.ts:608-643) gets right.

**Önerilen düzeltme:** Add a unique constraint on `commission_invoices (batchId, type)` (with a matching migration) and make `createAndIssue` upsert-or-skip on it, so a redelivered event finds the existing row and re-`issue()`s with the SAME invoiceId — which the provider contract already dedupes. Also move the post-issue `update` out of the `issue` try/catch and log a distinct CRITICAL ("issued at provider, status not recorded") when only the bookkeeping write fails.

---

## IMPORTANT (26)

### I1 — The 5-business-day payout deadline is the only regulated clock with no alert channel and no pre-breach warning

**Konum:** `backend/src/modules/settlements/settlement-payout.service.ts:271`

Complaints and takedowns each get a pre-deadline warning plus an ops digest email to `OPS_ALERT_EMAIL` (complaint-sla-cron.service.ts:84, moderation-takedown-cron.service.ts:76). The payout SLA gets neither: `reconcileStuckBatches` only queries batches already past `dueAt` and only calls `this.logger.error(...)` — no email, no warning window, no idempotency sentinel. And crossing `dueAt` requires a human: batches are created `CALCULATED` (settlement-batch-builder.service.ts:463) and only an explicit `adminApprove` moves them to `APPROVED`, which is all the payout cron picks up (settlement-payout.service.ts:83-86). Compounding it, `docs/operations.md:72` documents this cron *only* as "Flags batches SENT for more than 3 days without confirming SETTLED" — the overdue-unsent branch is absent from the cron inventory and from the "When a payout fails" runbook, so an operator following the docs has no reason to look for it. Failure scenario: ops is on holiday for a week, nobody opens admin-web, no email arrives, and every merchant's batch quietly blows the ≤5-business-day window that landing/messages/tr.json:208 and aracilik-sozlesmesi.ts:143 both describe as a legal obligation rather than a promise. (Mitigation that keeps this out of critical: admin-web's dashboard and settlements list do render a `DeadlineBadge` off `dueAt` — SettlementsListPage.tsx:128 — so it is visible to anyone who logs in.)

**Önerilen düzeltme:** Give `reconcileStuckBatches` the same shape as the other two sweeps: a pre-deadline warning branch (e.g. 1 business day remaining) with its own sentinel column, an `OPS_ALERT_EMAIL` digest for both branches, and update the docs/operations.md:72 row plus the "When a payout fails" section to describe the overdue-unsent condition.

### I2 — A failed commission e-invoice is a permanent silent dead end — no retry, no queue, no alert

**Konum:** `backend/src/modules/invoicing/commission-invoice.service.ts:178`

`createAndIssue` commits the `CommissionInvoice` as DRAFT, calls `facade.issue(...)`, and on failure catches the error and logs it, deliberately not rethrowing. Because `SettlementSentInvoiceHandler.handle` (settlement-sent-invoice.handler.ts:37) awaits that swallowed call, the outbox marks the event DONE and its whole retry/backoff/DEAD machinery — the mechanism that exists precisely so a failed side effect gets retried — never engages. There is no retry cron, no admin re-issue endpoint and no DRAFT-invoice queue anywhere: grepping `commissionInvoice` across backend/src finds only the create/update in this file plus a read-only `include` in settlements.service.ts:72/216. The same is true one branch earlier: an invalid `taxId` (line 71-76) logs CRITICAL and returns, so no invoice row is even drafted. Failure scenario: Nilvera is down for an hour during the 5-minute payout cron's window; a day's worth of batches go SENT, their commission invoices sit DRAFT forever, nobody is alerted, and the platform silently misses its VUK deadline to issue those invoices. There is also no `@@unique([batchId, type])` on CommissionInvoice (backend/prisma/schema.prisma:1098-1132), so any future manual re-drive of the handler duplicates invoice rows rather than being idempotent.

**Önerilen düzeltme:** Either rethrow from `createAndIssue` so the outbox retries (and add `@@unique([batchId, type])` + an upsert so retries are idempotent), or add a dedicated cron that re-attempts DRAFT invoices with an attempt counter and an `OPS_ALERT_EMAIL` alert once one is stuck, plus an admin-web list of DRAFT/failed invoices.

### I3 — The STT attestation checkbox does not say what the STT undertaking is, and the recorded contract version can't be resolved to a published document

**Konum:** `apps/merchant-web/src/i18n/locales/tr/onboarding.json:32`

"STT-expired food may never be sold" has exactly one enforcement point in this system: the `sttAttestationAccepted` boolean required at merchant submit (backend/src/modules/merchants/merchants.service.ts:188), which stamps `sttAttestationAcceptedAt` (line 206). The intermediation agreement defines that undertaking precisely — "İşletme, son tüketim tarihi geçmiş hiçbir ürünü Sürpriz Paket içeriğine dahil etmeyeceğini kabul ve taahhüt eder (\"STT Taahhüdü\")" (landing/content/legal/aracilik-sozlesmesi.ts:110). But the checkbox the merchant actually ticks reads "Satış Sözleşmesi ve Teslim Taahhüdü'nü okudum ve kabul ediyorum" — an expansion of "STT" as *Sales Agreement and Delivery Undertaking*, a document that does not exist anywhere in this repo and that says nothing about use-by dates. Neither checkbox links to any document (OnboardingPage.tsx:138-148 has no href at all). Separately, merchant-web sends the hard-coded `CONTRACT_VERSION = "2026-08"` (OnboardingPage.tsx:17) into a free-form `@IsString()` field, while the published agreement stamps itself `versionLabel: "v0.1 — 15 Ağustos 2026"` (aracilik-sozlesmesi.ts:75-78) — two unrelated identifiers, so `intermediationContractVersion` cannot be resolved to the text the merchant saw. Failure scenario: a merchant is suspended for putting expired product in a bag and disputes it; the platform's evidence is a timestamp against a checkbox whose visible text never mentioned son tüketim tarihi, and a version string matching no published document.

**Önerilen düzeltme:** Rewrite the `attestation.stt` string to state the STT Taahhüdü in the agreement's own words, link both checkboxes to the published `/yasal/aracilik-sozlesmesi` (and its STT article), and derive `CONTRACT_VERSION` from the shared legal-document module's `versionLabel` rather than a hand-typed constant.

### I4 — Membership renewal resets outstandingCents while an open batch still holds a reversible claim on the prior period's balance

**Konum:** `backend/src/modules/memberships/membership-renewal-cron.service.ts:220`

`recomputeBatch` achieves idempotency by adding the batch's OWN prior contribution back before re-deriving: `dueCents = sub.outstandingCents + batchPriorOffsetCents` (membership-offset.service.ts:148-153) and `outstanding := stored + batchPrior - applied` (line 250). That is only sound while `stored` refers to the SAME balance `batchPrior` was taken from. `renewOneLocked` overwrites `outstandingCents` with the new period's price unconditionally (lines 220-243) with no awareness of open CALCULATED/HELD batches, and there is no period guard anywhere in `lockAndResolveDue`.

Failure scenario: period-1 fee 300000. Batch A (still CALCULATED) offsets 300000 → subscription outstanding 0, `A.membershipOffsetCents = 300000`, `A.netPayoutCents = 200000`. The anniversary passes; the renewal cron sets `outstandingCents = 300000` for period 2. An admin then approves A, which recomputes first (settlements.service.ts:97): `dueCents = 300000 + 300000 = 600000`, so the batch offsets up to 500000 of its 500000 available — the merchant's payout silently drops from 200000 to 0 and a single day's batch withholds 1.67× the annual membership fee, spanning two periods. The MEMBERSHIP `CommissionInvoice` drafted for that batch (commission-invoice.service.ts:107) then carries period 2's fee on a document whose period is in period 1.

Worse variant: if the renewal wrote off an unrecovered balance W (line 194-217) and batch A's available then SHRINKS on a later pass, `outstanding := stored + batchPrior - applied` credits A's prior period-1 contribution back onto the period-2 balance, leaving the merchant owing more than period 2's list price for money already forgiven.

This fires once per merchant per year on whichever batch straddles the anniversary — routine at scale, not a rare race.

**Önerilen düzeltme:** Scope the add-back to the period the contribution belongs to: have `lockAndResolveDue` compare the batch's `periodStart` against the subscription's `currentPeriodStart`/`currentPeriodEnd` and, when they differ, cap `dueCents` at `batchPriorOffsetCents` (restore-only, exactly like the `exempt` branch does at line 148) rather than `stored + batchPrior`. Alternatively record the offset per (batch, subscription period) so a rollover cannot silently retarget it.

### I5 — admin-web also drops the access token from login, making the admin session wholly dependent on the refresh cookie

**Konum:** `apps/admin-web/src/auth/AuthContext.tsx:133`

Same seam as the consumer bug, different blast radius. `login()` calls `client.auth.adminLogin({email, password})` and uses only `result.user`; `setStoredAccessToken(result.accessToken)` is never called (grep confirms the only `setStoredAccessToken` call sites in the app are the two `null` clears at :75 and :151). Because admin-web uses cookie transport, it accidentally recovers: the first API call 401s, the engine's single-flight refresh presents `refreshToken_admin`, and `onTokensIssued` finally populates the token.

This is still a real defect on three counts. (1) Every admin login burns an immediate refresh rotation and a wasted request round-trip. (2) The moment the refresh cookie is not usable — a cross-site origin topology (see the SameSite finding), Safari/Firefox third-party cookie blocking, an enterprise policy, or a browser that dropped the `Set-Cookie` because `Secure` was set while the panel was reached over http — login "succeeds" and the very next request logs the admin straight back out with no diagnosable error, even though a perfectly valid 15-minute access token was sitting in the response body the whole time. (3) It defeats the mount-time race guard: `handleUnauthorized` is deliberately unguarded by `sessionSettledRef` (see the comment at :66-71), so a slow-failing session-restore refresh that resolves after a fast login will unconditionally set status back to `unauthenticated` — a race that only exists because the post-login state has no in-memory token to fall back on.

**Önerilen düzeltme:** Call `setStoredAccessToken(result.accessToken)` in `login()` immediately after `adminLogin` resolves, mirroring apps/merchant-web/src/auth/AuthContext.tsx:99. (Or fix it once in the shared engine, per the consumer finding.)

### I6 — Refresh cookie is not Secure and CORS falls back to the localhost dev allowlist on staging, which is a first-class deployed environment

**Konum:** `backend/src/modules/auth/refresh-cookie-transport.util.ts:114`

`setRefreshCookie` sets `secure: process.env.NODE_ENV === "production"`, and `resolveCorsOrigins()` (backend/src/main.ts:49) falls back to the four `http://localhost:*` dev origins whenever `NODE_ENV !== "production"`. But `staging` is an explicitly supported, validated environment (`VALID_NODE_ENVS` in backend/src/config/env.validation.ts:77-82) with its own internet-reachable deployment on the shared VPS (ops/docker-compose.staging.yml, ports 4760-4768). The env-validation file's own error message even says a misspelled NODE_ENV used to mean "mock SMS provider allowed, non-secure refresh cookie" — yet `staging` still gets exactly that treatment, because every gate is `=== "production"` rather than `!== "development"/"test"`.

Failure scenario: a staging deploy behind HTTPS issues 30-day `refreshToken_admin`/`refreshToken_merchant` cookies without the `Secure` attribute. Any downgrade to plaintext on that host (a stray http:// link, an http redirect, a hostile network on the shared VPS) transmits a live 30-day admin refresh credential in the clear. Separately, if `CORS_ALLOWED_ORIGINS` is left unset on staging (the compose file doesn't mark it required — only prod's header comment mentions it), the staging API silently enables `credentials: true` CORS for `http://localhost:3000/5173/5174/8081`, so any page the operator happens to have running locally can make credentialed cross-origin calls to staging.

**Önerilen düzeltme:** Gate both on "not a local environment" rather than "is production": `secure: process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging"` (or drive it from a single `isDeployedEnv(nodeEnv)` helper exported from env.validation.ts and reuse it in main.ts's `resolveCorsOrigins`, SmsService, and anywhere else `=== "production"` guards a security decision). Also make `CORS_ALLOWED_ORIGINS` required for staging in ops/docker-compose.staging.yml's documented variable list.

### I7 — SameSite=strict refresh cookie silently assumes a same-site topology the CORS design does not require

**Konum:** `backend/src/modules/auth/refresh-cookie-transport.util.ts:115`

The refresh cookie is set `sameSite: "strict"`, while `main.ts` was extended (commit for Task 9.5) precisely so merchant-web/admin-web/landing can call the API from *other origins* with `credentials: true`. Origin and site are not the same thing: `merchant.kurtar.com` → `api.kurtar.com` is same-site and works, but any topology where a panel and the API sit on different registrable domains (a Vercel/Netlify/Cloudflare-Pages default hostname, a separate `.com.tr`/`.app` domain for the merchant panel, a `*.ghcr`-style preview host) is cross-site, and the browser will never attach a `SameSite=Strict` cookie to those XHRs — nor reliably store the `Set-Cookie` from the login response.

Failure scenario: merchant-web is deployed to a different apex than the API. Login succeeds; merchant-web survives on its in-memory access token for 15 minutes and then permanently 401s with no recovery path, and every hard reload starts logged out because `AuthProvider`'s mount-time `getMe()` → 401 → refresh has no cookie to present. admin-web is worse: combined with the missing `setStoredAccessToken` above, login is an immediate dead loop with no error the operator can act on. Nothing in the code, `.env.example`, `docs/frontend-contract.md` or the launch checklist mentions the SameSite constraint — checklist item 44 only says "confirm the real origin topology", which a reader will interpret as a CORS-allowlist task and satisfy without ever discovering the cookie will not travel.

**Önerilen düzeltme:** Either (a) document the constraint loudly at the cookie definition and in the launch checklist — "every browser surface MUST be served from the same registrable domain as the API, or the refresh cookie will not be sent" — or (b) make the attribute configurable (`REFRESH_COOKIE_SAMESITE`, defaulting to `strict`, allowing `none` for a genuinely cross-site deployment, and forcing `secure: true` whenever it is `none`). Whichever is chosen, add it to `docs/launch-checklist.md` as an explicit "verify the cookie is actually present on the second request from the real panel origin" step, since the failure is silent.

### I8 — Money-moving admin endpoints record no acting admin — the only admin mutations in the codebase that don't

**Konum:** `backend/src/modules/settlements/admin-settlements.controller.ts:64`

`POST /api/admin/settlements/:id/approve`, `/hold`, `/retry`, `/run-nightly` and `POST /api/admin/pricing` (backend/src/modules/settlements/admin-pricing.controller.ts:48) neither bind `@CurrentUser("id")` nor write an AuditLog row — `grep -rn "auditLog.create"` over backend/src/modules returns complaints, memberships, merchants, moderation, offers, ratings and stores, and nothing from settlements. Every *other* admin mutation surface in this codebase threads the admin id through and audits it, and `MerchantsService.adminGetDetail` goes as far as committing the audit row in the same transaction as a sensitive READ (backend/src/modules/merchants/merchants.service.ts:345-395).

Failure scenario: an admin approves a settlement batch, which flips it to APPROVED and hands it to `SettlementPayoutService` to send real money to a merchant's IBAN; or schedules a `PlatformPricing` row that changes the per-bag platform fee for every merchant on the platform. Afterwards there is no record anywhere of which of the N admin accounts did either. If a payout goes to the wrong merchant, or a fee change is disputed by merchants, or an admin account is compromised, there is nothing to reconstruct from — the `AuditLog` table that exists specifically for this contains rows for approving a five-star rating but none for approving a payout. For a Turkish marketplace subject to ETAHS/Ticaret Bakanlığı evidence expectations, the highest-value action on the platform is the one with no evidence trail.

**Önerilen düzeltme:** Bind `@CurrentUser("id") adminId` on all five handlers and pass it down; write an `AuditLog` row inside the same transaction as each status transition (`settlement.approved` / `settlement.held` / `settlement.retried` / `pricing.scheduled`), following the `{actorType, actorId, action, entity, entityId, diffJson}` shape and `entity.verb` naming the other modules already use.

### I9 — Automated rollback reverts the api image past an already-applied schema change and declares success on a DB-free liveness probe

**Konum:** `.github/workflows/release-deploy.yml:651`

The deploy runs `prisma migrate deploy` at line 587, then swaps containers at line 598. If the swap or either health probe fails, the "Rollback: revert api container to previous image" step (651-683) rewrites IMAGE_TAG to the previous tag and recreates only the `api` service — against a database that has already been migrated forward. Its success criterion is `curl http://127.0.0.1:4750/api/health`.

`backend/src/modules/health/health.controller.ts:22-29` returns a static `{status:"ok", service:"kurtar-api", uptimeSec}` — it never touches Postgres or Redis. So the probe proves the process started, nothing more.

Failure scenario, using a migration that is actually on this branch: `backend/prisma/migrations/20260815200000_social_trust_and_moderation/migration.sql:95` runs `ALTER TABLE "complaint_tickets" DROP COLUMN "category"` and re-adds it as a `ComplaintCategory` enum. Deploy that release; have the frontend health probe (line 616) fail for an unrelated reason (a slow `serve` start on 4756). Rollback fires, brings back the previous api image whose generated Prisma client still selects `complaint_tickets.category` as TEXT, `/api/health` answers in milliseconds, and the step prints "Rollback succeeded — api is healthy again". Every complaints/SLA query then errors in production with a green-looking recovery. The complaint-SLA cron (`complaint-sla-cron.service.ts:45`) is the thing enforcing a 15-day ETAHS deadline, and it fails on the same query.

Secondary, already documented at lines 65-70 but worth restating as an integration issue: the rollback recreates only `api`, so merchant-web/admin-web/landing stay on the new tag, built against the new contract, talking to the old backend.

**Önerilen düzeltme:** Either (a) gate the rollback's success on a readiness check that actually round-trips the database (a `/api/ready` that does `SELECT 1` plus a Redis PING, distinct from the liveness `/api/health` the compose healthcheck uses), or (b) make the rollback refuse to auto-run and print manual instructions when the release contained a non-additive migration — the doctor already knows how to classify destructive SQL (`scripts/db-migration-doctor.sh:214`), so the same pattern can decide 'is the previous image schema-compatible'. At minimum, roll back all four services, not just api.

### I10 — Every migration is reversible in CI, but production has no way to apply a down.sql — and the runbook never says so

**Konum:** `docs/operations.md:20`

`quality-gates.yml:182-200` runs a genuine reversibility round-trip (revert every down.sql in reverse order, drop `_prisma_migrations`, redeploy every up) and prints "every migration's down.sql is genuinely reversible". All 14 migrations have a real, non-vacuous down.sql (spot-checked 20260812171242_init, 20260814210000, 20260815090000, 20260815200000, 20260815210000 — each drops exactly what its up added).

But nothing in the production path can use them. `prisma migrate deploy` is forward-only; `scripts/db-migration-doctor.sh` never references down.sql; `release-deploy.yml`'s only schema-revert guidance (685-702) is "restore the pre-deploy backup", which discards every write since the backup was taken minutes earlier. `docs/operations.md`'s "Deploying" and "The migration doctor" sections do not mention down.sql at all, and neither does the README.

Failure scenario: a release ships a migration that is syntactically fine but semantically wrong (say a CHECK constraint that rejects a legitimate settlement state). Production is up and taking money. An operator who has read the CI output reasonably believes a schema rollback exists, finds `backend/prisma/migrations/<name>/down.sql`, and pipes it into psql. It works — but `_prisma_migrations` still records the migration as applied, so `prisma migrate status` reports a clean state and the next deploy's `migrate deploy` skips re-applying it. The schema is now permanently diverged from the migration history with no diagnostic, and the doctor's drift check (line 154) will not catch it because Prisma's own status is what it parses.

The alternative — restoring the backup — means losing every reservation, payment and redemption written since the deploy started.

**Önerilen düzeltme:** Add a short 'Reverting a migration' section to docs/operations.md stating explicitly that down.sql is a CI-only reversibility proof, that production is forward-only, and giving the one correct manual sequence (apply down.sql, then `prisma migrate resolve --rolled-back <name>` through the same `compose run --workdir /app/backend` invocation the doctor uses, so the ledger stays truthful). Better still, add a `scripts/db-migration-rollback.sh` that does both atomically, so the ledger step cannot be forgotten under pressure.

### I11 — Both deploy commands in the operations runbook fail verbatim on the real production host

**Konum:** `docs/operations.md:12`

Two of the six numbered steps in the runbook's "Deploying" section cannot be run as written on the box:

Step 4 (line 12): `docker compose -f ops/docker-compose.prod.yml pull`. The pipeline scps the compose file flat to `/root/kurtar/docker-compose.prod.yml` (`release-deploy.yml:494-496`); there is no `ops/` directory on the server. Only `scripts/` is nested, and deliberately so (see the workflow's own comment at 497-502).

Step 5 (line 13): `docker compose run --rm api npx prisma migrate deploy`. The production image's WORKDIR is `/app` (`backend/Dockerfile:69`) with the schema at `/app/backend/prisma/schema.prisma`, so this exits with 'Could not find Prisma Schema'. Both the real workflow (line 587) and the doctor (`db-migration-doctor.sh:75`) pass `--workdir /app/backend` for exactly this reason; the runbook drops it. Neither command passes `--env-file .env.production` either, which only works because the deploy leaves a `.env -> .env.production` symlink (line 524) — undocumented in the runbook.

Failure scenario: the pipeline is INERT (no GitHub remote, per the workflow's own header at lines 1-8), so the *first* production deploy is likely to be a human following this document by hand. They get two failures in a row on the two steps that matter most, and step 5 is the one that decides whether a bad migration reaches traffic.

**Önerilen düzeltme:** Correct the runbook to the real on-host layout: `cd /root/kurtar && docker compose -f docker-compose.prod.yml --env-file .env.production pull` and `... run --rm --workdir /app/backend api npx prisma migrate deploy`, and note that the deploy leaves `.env` symlinked to `.env.production`.

### I12 — SLA countdowns are frozen at fetch time on the two queues where they are acted on

**Konum:** `apps/admin-web/src/App.tsx:19`

`slaCountdownMs` / `takedownCountdownMs` are computed server-side at request time and never recomputed client-side (deliberate, per apps/admin-web/src/lib/countdown.ts:1-10). But the QueryClient sets `refetchOnWindowFocus: false` globally, and neither `useComplaintsList` (apps/admin-web/src/features/complaints/useComplaints.ts:43-96) nor `useReportsList` (apps/admin-web/src/features/moderation/useReports.ts:18-29) sets `refetchInterval` or `staleTime`. The dashboard hooks DO refetch every 60s (apps/admin-web/src/features/dashboard/useDashboardData.ts:10, 18, 45, 62) — so the tiles stay honest while the work queues silently do not.

Failure scenario: an ops admin opens /moderation at 09:00. A report shows "UYARI — 9 saat 40 dakika kaldı" on its 48h takedown badge (rendered like apps/admin-web/src/features/complaints/ComplaintsListPage.tsx:176-179). They work in other tabs and come back at 17:00 without navigating or reloading. The badge still says "9 saat 40 dakika kaldı" and is still styled `warning`, when the real remaining time is under 2 hours and the state is `critical`. Alt-tabbing back does not refresh it because refetchOnWindowFocus is off. The drift is always in the unsafe direction (more time than exists), and there is no "as of HH:MM" stamp anywhere on the badge to make the staleness visible.

The synthetic `AT_RISK` filter (useComplaints.ts:71-79) is derived from the same frozen numbers, so a complaint that crosses into the warning window while the page is open never appears in the filter either.

**Önerilen düzeltme:** Add `refetchInterval` (60s, matching the dashboard's own REFRESH_INTERVAL_MS) to `useComplaintsList` and `useReportsList`, or re-enable `refetchOnWindowFocus` for those keys. Alternatively have DeadlineBadge accept a server `deadlineAt` instant plus `dataUpdatedAt` and tick locally; at minimum render the fetch time next to the badge so a stale value is visibly stale.

### I13 — The share-link → app hand-off deep-links to a route apps/consumer does not have, with a package name that can never match

**Konum:** `landing/components/OfferAppOpener.tsx:28`

`buildDeepLinkHref` produces `kurtar://o/<offerId>` on iOS and `intent://o/<offerId>#Intent;scheme=kurtar;package=app.kurtar.consumer.PLACEHOLDER;...` on Android. The scheme is right (apps/consumer/app.json declares `"scheme": "kurtar"`), but:
- apps/consumer has NO `o/[id]` route. Its expo-router tree (apps/consumer/src/app/, registered in apps/consumer/src/app/_layout.tsx:68-84) has `offer/[id]`, `store/[id]`, `order/[id]` — nothing at `/o/...`. There is also no `+not-found.tsx`. So a user with the app installed who taps a shared offer link lands on expo-router's unmatched-route screen instead of the offer.
- landing/lib/site-config.ts:49 hardcodes `androidPackageName: "app.kurtar.consumer.PLACEHOLDER"` while apps/consumer/app.json now declares the real package `app.kurtar.consumer`. Chrome will never resolve the PLACEHOLDER package, so every Android user is sent to a nonexistent Play Store listing even when the app is installed.

The placeholder store IDs are a documented, owned pre-launch item; the missing route is not documented anywhere — the bridge page's own doc comment (landing/app/[locale]/o/[id]/page.tsx:13-22) discusses the missing backend endpoint but assumes the app route exists.

**Önerilen düzeltme:** Add `apps/consumer/src/app/o/[id].tsx` as a thin redirect to `/offer/[id]` (and a `+not-found.tsx` so any future unmatched deep link degrades to a branded screen rather than the dev unmatched view). Swap the Android package name for `app.kurtar.consumer` now that app.json fixes it, leaving only the store IDs as placeholders.

### I14 — The breached SLA badge is the only urgency state that renders no border — an undefined token silently drops one of its three non-colour signals

**Konum:** `apps/admin-web/src/components/DeadlineBadge.module.css:51`

`.breached` sets `border: 2px solid var(--color-danger-900)`. `@kurtar/ui-tokens`'s `semantic.danger` ramp only has steps 50/500/700 (packages/ui-tokens/src/colors.ts:76-80), so `--color-danger-900` is never injected by apps/admin-web/src/styles/tokens.ts. An unresolved `var()` makes the whole `border` shorthand invalid at computed-value time, so `border-style` falls back to its initial `none` — the breached badge renders with no border at all, while `.safe`, `.warning` and `.critical` (lines 32, 38, 44) all render theirs.

apps/admin-web/src/components/DeadlineBadge.tsx:25-35 documents three independent signals precisely so "a breached complaint is visually flagged by something other than colour alone". The most severe state is the one that loses the border signal. DeadlineBadge.spec.tsx asserts the glyph/label/`data-urgency` attribute, not computed style, so it stays green.

Root cause is cross-cutting: landing has a real guard for this (landing/test/palette-parity.test.ts re-derives every hand-copied hex from @kurtar/ui-tokens and fails on drift), but neither Vite app has any check that a `var(--…)` referenced in a .module.css is actually produced by its token bridge. merchant-web has the same class of bug (separate finding on PickupListSection.module.css).

**Önerilen düzeltme:** Use `--color-danger-700` (or add a 900 step to `semantic.danger` in ui-tokens and mirror it in both bridges). Then add a small test in each Vite app that greps every `var(--x)` out of src/**/*.module.css and asserts it appears in the property set the token injector produces — the same enforcement landing already has.

### I15 — The redeem screen never shows the pickup window it is being judged against, and every rejection reason collapses to one vague Turkish sentence

**Konum:** `apps/consumer/src/app/redeem/[id].tsx:120`

The swipe screen renders store name, bag title, a live clock, the code and the quantity — but not the pickup window. The swipe control is shown for ANY `CONFIRMED` reservation (line 75), including one whose window opens in four hours or closed twenty minutes ago.

The backend rejects too-early, too-late, and every non-CONFIRMED status with the SAME code: backend/src/modules/reservations/reservations.service.ts:834-841 throws `notRedeemableError()` (RESERVATION_NOT_REDEEMABLE) for `status !== CONFIRMED || now < pickupStartAt || now > pickupEndAt`. The consumer maps that single code to "Bu sipariş şu anda teslim alınamıyor." (apps/consumer/src/i18n/tr.json:302) and renders it as small text at redeem/[id].tsx:162-164.

Failure scenario: a customer arrives at 17:50 for an 18:30–20:00 window, swipes in front of the cashier on the orange full-screen ceremony, and gets one line with no reason and no time reference. The staff-facing screen has no window either. The one screen that does explain it — the notRedeemable empty state at lines 77-89, whose copy literally says "Teslim alma penceresi henüz başlamamış ya da geçmiş olabilir" (tr.json:201) — is unreachable in exactly this case, because the status IS CONFIRMED. merchant-web's copy for the same code is equally reason-free ("Bu rezervasyon şu anda teslim edilmiş olarak işaretlenemez.", apps/merchant-web/src/i18n/locales/tr/errors.json).

Compounding it: `pickupEndAt` is only known from the device-local AsyncStorage snapshot or a same-day live store lookup (apps/consumer/src/hooks/use-order-details.ts:15-17, 100-112), so on a reinstalled device the app cannot show the window even if it wanted to.

**Önerilen düzeltme:** Render the pickup window on the redeem screen next to the live clock, and gate/soften the swipe control when `now` is outside it with a pre-emptive Turkish explanation ("Teslim alma 18:30'da başlıyor") rather than letting the swipe fail. Split the backend code into RESERVATION_PICKUP_NOT_STARTED / RESERVATION_PICKUP_WINDOW_PASSED / RESERVATION_NOT_REDEEMABLE and add copy to both consumer and merchant-web catalogues. Adding pickupStartAt/pickupEndAt to `ReservationDto` fixes this and the derivation hack below at the same time.

### I16 — Pickup countdown prints mm:ss for a pickup hours away — "Teslim alma: 18:30 · 420:00"

**Konum:** `apps/consumer/src/lib/format.ts:60`

`formatCountdown` produces `MM:SS` with unbounded minutes: `minutes = Math.floor(total / 60)`. Its only consumer is `PickupCountdown` (apps/consumer/src/components/PickupCountdown.tsx:29), which is rendered for every CONFIRMED reservation on the Orders tab (apps/consumer/src/components/OrderRow.tsx:71-73) and on the order detail screen (apps/consumer/src/app/order/[id].tsx:68-70).

Failure scenario: a customer reserves a bag at 11:30 for an 18:30 pickup. The Orders row reads "Teslim alma: 18:30 · 420:00", which reads as either 420 hours or a broken clock. PickupCountdown.tsx:11-12's own doc comment claims the intended output is "18:30 (2s 14dk sonra)" — implementation and documented design disagree — and this is the default state of the app's main list for essentially every active order, since reservations are made hours before pickup by design.

apps/consumer/src/__tests__/format.test.ts:35-38 only exercises 65s, 3s, -5s and 0 — nothing above two minutes — so the mm:ss assumption is never challenged.

**Önerilen düzeltme:** Add a day/hour-aware formatter ("2 sa 14 dk", "18 dk") for durations ≥1h and use it in PickupCountdown, keeping mm:ss only if a genuinely short-timer use case appears later. Extend format.test.ts with a multi-hour case.

### I17 — Three surfaces, three timezone policies: merchant-web pins Europe/Istanbul, admin-web and consumer use the viewer's clock

**Konum:** `apps/admin-web/src/lib/date.ts:1`

merchant-web pins `timeZone: "Europe/Istanbul"` on every formatter and derives its calendar day from it (apps/merchant-web/src/shared/format.ts:14-36, 54-67, with an explicit comment that this must agree with the backend's istanbulDateKey). admin-web's `formatDate`/`formatDateTime` (apps/admin-web/src/lib/date.ts:1-13) and the consumer's `formatClockTime`/`formatShortDate` (apps/consumer/src/lib/format.ts:31-37, 54-57) omit `timeZone` entirely and therefore render in the viewer's own zone.

Failure scenario: a settlement batch with `periodEnd` at 2026-08-15T21:30:00Z is shown by merchant-web as 16 Ağustos (Istanbul, UTC+3) and by admin-web on a laptop set to UTC or CET as 15 Ağustos. On the settlement detail page `formatDate(batch.periodStart/periodEnd)` (apps/admin-web/src/features/settlements/SettlementDetailPage.tsx:117-120) and the `dueAt` badge feed the operator's judgement about a legally-bounded 5-business-day payout, so merchant and operator are looking at different dates for the same batch while both are "correct" for their own machine. The consumer app has the milder version: a phone not on Turkish time shows a pickup window shifted from the one the merchant sees.

A product that is Turkey-only should have exactly one answer to "what day is it", and merchant-web already wrote it down.

**Önerilen düzeltme:** Add `timeZone: "Europe/Istanbul"` to admin-web's two Intl.DateTimeFormat instances and to the consumer's time/date formatters — or, better, move merchant-web's istanbul-pinned formatters into @kurtar/ui-tokens (or a small @kurtar/format package) next to `formatMoneyCents`, the same consolidation the money formatter already got.

### I18 — POST /me/location has no caller on any surface — the OFFER_NEARBY push audience is permanently empty

**Konum:** `packages/api-client/src/domains/account.ts:18`

`client.account.updateLocation` is never invoked anywhere in apps/*, landing/ or e2e/ (grepped for both the method name and the raw path). The only writer of `users.lastLat`/`lastLng`/`lastLocationAt` is `UserLocationService.update`, reachable only through that endpoint. `OfferPublishedHandler.queryNearbyUserIds` (backend/src/modules/outbox/handlers/offer-published.handler.ts:155-168) filters `AND u."lastLat" IS NOT NULL AND u."lastLng" IS NOT NULL` before the `ST_DWithin` test, so the nearby fan-out returns zero candidates for every publish, forever. Meanwhile apps/consumer/src/app/notification-preferences.tsx:85-86,145 ships a user-facing "nearby" toggle plus a radius control, and the consumer app already obtains GPS coordinates (src/hooks/use-effective-location.ts) — it just keeps them client-side for discovery queries and never posts them. Failure scenario: a consumer enables nearby-offer notifications, sets a 3 km radius, and never receives a single push; nothing logs an error because the query legitimately returns an empty set.

**Önerilen düzeltme:** Call `client.account.updateLocation({lat, lng})` from `use-effective-location.ts` whenever a fresh GPS fix is obtained (throttled), or remove the nearbyEnabled/nearbyRadiusM controls from the preferences screen until the write path exists.

### I19 — POST /reports has no caller — the whole moderation subsystem can never receive an item

**Konum:** `packages/api-client/src/domains/complaints.ts:34`

`client.complaints.createReport` (→ `POST /api/reports`, `@Public`, backend/src/modules/moderation/reports.controller.ts:28) is not called from apps/consumer, apps/merchant-web, apps/admin-web, landing or e2e. Nothing else in the codebase writes `ContentReport`. Downstream, `GET /admin/reports` + `POST /admin/reports/{id}/action|dismiss`, admin-web's whole moderation feature (ReportsListPage/ReportActionDialog), the `pendingContentReports` dashboard tile, and `ModerationTakedownCronService`'s 48-hour takedown SLA sweep all read a table that can only ever be empty in production. Failure scenario: a consumer sees an abusive rating or a misrepresented store listing and has no in-product way to report it; the platform's notice-and-takedown obligation has no intake, and the admin-side machinery built to service it is inert.

**Önerilen düzeltme:** Add a report affordance to the consumer app (store page → report store/offer; rating card → report rating) calling `client.complaints.createReport`. Until then the moderation queue and the 48h SLA cron are decorative.

### I20 — Consumers can file complaints but never read them — GET /complaints/mine and GET /complaints/:id have no caller

**Konum:** `packages/api-client/src/domains/complaints.ts:12`

apps/consumer calls `client.complaints.create` (from src/app/complaint/new.tsx, linked from profile.tsx:93) but never `listMine` or `get`, and there is no complaint list or thread screen in the Expo router tree. Combined with the merchant-side 403 above, the complaint message thread is write-only at both ends: `ComplaintMessage` rows created by an ADMIN via admin-web (`client.complaints.addMessage`) are visible to nobody but other admins. Failure scenario: a consumer reports a spoiled bag, an admin resolves it and posts an explanation, and the consumer never sees the response or the resolution — while `ComplaintsService.getMine`, the `ComplaintDetailResponseDto`, and the 15-day SLA machinery all exist to support exactly that conversation.

**Önerilen düzeltme:** Add a "my complaints" list + thread screen to the consumer app wired to `client.complaints.listMine`/`get`/`addMessage`.

### I21 — Logout never unregisters the push token, so a signed-out device keeps receiving the previous user's pickup codes

**Konum:** `apps/consumer/src/lib/auth-context.tsx:128`

`logout()` calls `client.auth.logout()` and clears local storage, but never `client.account.pushTokens.remove(token)` — `DELETE /api/me/push-tokens/{token}` has zero callers anywhere (packages/api-client/src/domains/account.ts:26), even though `PushTokensService.remove` was written user-scoped specifically for this. The PushToken row stays bound to the previous `userId` until some other user happens to register the same Expo token. RESERVATION_CONFIRMED / PICKUP_REMINDER / RESERVATION_CANCELLED_REFUND are `transactional: true` in NOTIFICATION_POLICY_TABLE, so they bypass every preference and quiet-hours gate; `ReservationConfirmedHandler` puts the pickup code directly in the push body (`Teslim alma kodun: ${payload.code}` — backend/src/modules/outbox/handlers/reservation-confirmed.handler.ts:52). Failure scenario: user A signs out and hands the phone to user B (or sells it); A's next reservation confirmation and pickup reminder — including the bearer code a merchant matches against at handover — appear on B's lock screen.

**Önerilen düzeltme:** Call `client.account.pushTokens.remove(currentExpoToken)` before `client.auth.logout()` in `auth-context.tsx`'s logout, best-effort like the logout call itself.

### I22 — GET /admin/merchants/{id} — the audited KYC detail read — has no client method and no admin UI, so approval really is the rubber stamp it was built to prevent

**Konum:** `backend/src/modules/merchants/admin-merchants.controller.ts:51`

`MerchantsService.adminGetDetail` (backend/src/modules/merchants/merchants.service.ts:345) exposes taxId cross-check material, mersisNo, kepAddress, full unmasked IBAN, docsJson and the full verificationEvents history, and writes a `merchant.kyc.viewed` AuditLog row in the same transaction. Its own doc comment states it is "the ONLY place an admin sees what a merchant actually submitted before approving/rejecting them" and that without it "the approval step … is a rubber stamp". But `packages/api-client/src/domains/admin.ts` exposes only `merchants.list/approve/reject/suspend` — no `getDetail` — and admin-web has no merchant detail page (apps/admin-web/src/features/merchants/ contains only MerchantsPage, MerchantActionDialog and useMerchants.ts). `adminList` deliberately selects only id/legalName/tradeName/taxId/verificationStatus/verifiedAt/createdAt. Failure scenario: an admin approves a merchant from the queue with no access to the bank document, the IBAN, or the submitted KYC files; the `merchant.kyc.viewed` audit trail is empty for every approval ever made, so a later dispute cannot show that anyone looked.

**Önerilen düzeltme:** Add `admin.merchants.getDetail(id)` to packages/api-client/src/domains/admin.ts and a merchant detail view in admin-web that the approve/reject dialogs open from.

### I23 — CommissionInvoiceService is the only outbox handler that isn't idempotent, and there is no unique constraint to stop a duplicate tax document

**Konum:** `backend/src/modules/invoicing/commission-invoice.service.ts:147`

The outbox worker is explicitly at-least-once: `claimBatch` re-claims any PROCESSING row whose 5-minute lease expired (backend/src/modules/outbox/outbox-worker.service.ts:35,164-178), and a throwing handler is retried up to MAX_OUTBOX_ATTEMPTS=6. Every other handler guards for this — MembershipsService logs "already has a subscription — duplicate merchant.approved.v1 delivery, no-op" (memberships.service.ts:112), ImpactLedgerHandler documents its own idempotency. `createInvoicesForSentBatch` does not: it calls `prisma.commissionInvoice.create(...)` unconditionally, and `CommissionInvoice` has no unique constraint on `(batchId, type)` (backend/prisma/schema.prisma:1098-1132). Failure scenario: a batch with both `bagFeeCents > 0` and `membershipOffsetCents > 0` drafts the BAG_FEE invoice successfully, then the MEMBERSHIP `create` fails on a transient DB error; the handler throws, the outbox retries the same event, and a second BAG_FEE CommissionInvoice is created for the same batch — two tax documents for one commission charge, with no constraint or reconciliation to catch it. The same happens if the handler is re-claimed after a lease expiry.

**Önerilen düzeltme:** Add `@@unique([batchId, type])` to CommissionInvoice (with a reversible migration) and make `createAndIssue` upsert-or-skip on that key, matching the guard style the other handlers already use.

### I24 — settlement-reconciliation alerts on a state nothing can ever clear, unbounded and without a sentinel

**Konum:** `backend/src/modules/settlements/settlement-payout.service.ts:246`

`reconcileStuckBatches` logs a CRITICAL line for every batch that has been SENT for 3+ days without reaching SETTLED. Nothing in the codebase ever writes SETTLED: `settlement-transitions.ts:20` declares `SENT -> SETTLED` "with no current writer", there is no admin endpoint for it (admin-settlements.controller.ts exposes only approve/hold/retry), and no api-client method. So every batch the platform ever pays out enters this alert set three days later and never leaves it. Unlike its sibling SLA crons — `complaint-sla-cron` and `moderation-takedown-cron` both use `BATCH_LIMIT = 500` plus an idempotency sentinel column so a row alerts once — this one does an unbounded `findMany` with no `take` and no sentinel, and re-logs the entire history every day at 09:00. Failure scenario: after a few months of live payouts the daily tick loads tens of thousands of rows and emits tens of thousands of `CRITICAL:` lines, permanently burying branch (b) — the real 'past its 5-business-day dueAt, SLA missed' alerts that share the same log level in the same method.

**Önerilen düzeltme:** Bound both queries (`take: BATCH_LIMIT`, oldest first) and add a `reconciliationAlertSentAt` sentinel stamped by a guarded UPDATE, exactly as complaint-sla-cron.service.ts does — or gate branch (a) behind a flag until a real SENT→SETTLED reconciliation path exists.

### I25 — admin-web throws away the access token its own login returns, so every session depends on an immediate 401→refresh round trip

**Konum:** `apps/admin-web/src/auth/AuthContext.tsx:133`

Same root cause as the consumer finding: `login()` awaits `client.auth.adminLogin()`, caches the profile and flips status to "authenticated", but never calls `setStoredAccessToken(result.accessToken)`. Grepping the app confirms `setStoredAccessToken` is only ever called with `null` (AuthContext.tsx:75 and :151); `currentAccessToken` is only ever set from `onTokensIssued` (api/client.ts:59-61), which the engine fires only on refresh. `getStoredAccessToken` (api/client.ts:21) is exported and never used.

admin-web survives this only because it uses cookie transport: the first dashboard query 401s, the engine refreshes off the just-set `refreshToken_admin` cookie, and retries. Consequences: (1) every login costs an extra failed request plus an immediate, pointless refresh-token rotation; (2) if the refresh cookie doesn't round-trip for any reason (a CORS/origin topology mistake, an ITP-style cookie policy, a misconfigured `CORS_ALLOWED_ORIGINS`), login *succeeds* — but with `wantsCookieOnlyTransport` stripping `refreshToken` out of the JSON body (backend/src/modules/auth/refresh-cookie-transport.util.ts:139-144) and the access token discarded, admin-web holds no credential at all and bounces the admin straight back to /login with no diagnosable error. Storing the access token would keep the panel working for 15 minutes and make the cookie problem visible as a delayed logout rather than an instant one.

**Önerilen düzeltme:** Add `setStoredAccessToken(result.accessToken)` in `login()` — or, preferably, fix the engine to fire `onTokensIssued` for the auth-issuing calls (see the consumer finding) and let admin-web's existing `onTokensIssued` handler do it, so all three surfaces share one mechanism.

### I26 — landing still double-casts a client response through a hand-written shape, citing a bug that is fixed

**Konum:** `landing/lib/impact.ts:83`

`const totals = (await client.impact.getPublic()) as unknown as { mealsSaved: number; co2eGrams: number; moneySavedCents: number };` sits under a 24-line comment (:60-82) asserting that "EVERY domain method's compiled dist/*.d.ts resolves to `Promise<never>`". That is no longer true — `SuccessBody` was fixed (packages/api-client/src/core-types.ts:88-103) and is regression-gated against the built output by `npm run typecheck:build` (quality-gates.yml:500-501). I verified against the current `dist/`: `client.impact.getPublic()` resolves to the real `PublicImpactTotalsDto`.

The `as unknown as` is a double cast, so it silences the checker completely in both directions. Failure scenario: someone renames `co2eGrams` on `PublicImpactTotalsDto` (backend/src/modules/impact/dto/impact-response.dto.ts:6). openapi.json regenerates, the drift gate passes, the api-client types regenerate, every other app's `tsc` flags the rename — and landing compiles clean while its home-page impact counter renders `undefined`. The `catch` at :94 doesn't help: no error is thrown, the values are just missing.

merchant-web and admin-web both did the migration after the fix (apps/merchant-web/src/api/response-types.ts:1-20 and apps/admin-web/src/api/admin-types.ts:7-22 document deleting their casts); landing was left behind.

**Önerilen düzeltme:** Delete the cast and the stale comment: `const totals = await client.impact.getPublic();`. The field reads at :90-92 then typecheck against the real generated schema.

---

## MINOR (19)

### M1 — A complaint's 15-day ETAHS clock starts with no notification to the merchant who has to answer it

**Konum:** `backend/src/modules/complaints/complaints.service.ts:114`

`ComplaintsService.create` writes the ticket and its `slaDeadlineAt` but publishes nothing — `OUTBOX_EVENT_TYPES` (backend/src/modules/outbox/event-types.ts:15-64) has no complaint event, and grepping the complaints module finds no `outbox.publish` or notification call. The merchant only learns a complaint exists if they happen to open merchant-web's Reputation → Complaints panel. Every other merchant-relevant lifecycle moment (offer cancelled, merchant approved/rejected/suspended, settlement sent) does get an outbox-driven email. Failure scenario: a low-volume merchant doesn't open the panel for two weeks; the ops warning fires at 48h remaining and the ticket auto-ESCALATEs at day 15 without the responding party ever having been told. Also note that once a ticket is ESCALATED, no sweep touches it again (escalateBreached's WHERE only matches OPEN/MERCHANT_RESPONDED, complaint-sla-cron.service.ts:151) — resolution, which is the actual ETAHS obligation, has no ongoing clock.

**Önerilen düzeltme:** Publish a `complaint.created.v1` outbox event in the same transaction as the ticket and drive the existing merchant-email handler pattern off it; consider a second, longer-horizon sweep (or an admin dashboard tile) for ESCALATED-but-unresolved tickets.

### M2 — Clawback-only sweep mints a new empty HELD batch every night for a merchant whose demand cannot be recovered

**Konum:** `backend/src/modules/settlements/settlement-batch-builder.service.ts:363`

The sweep calls `createOrExtendBatch(merchantId, todayKey, [], new Map())` — a different `periodStart` each night — so a merchant with an outstanding clawback and no earnings gets one brand-new batch per day. With zero lines, `computeSettlement` returns gross 0, `refundClawbackCents` 0 and `carriedShortfallCents = demand > 0`, so each one goes HELD and stays HELD (its own exportable demand is 0, so the chain carries nothing forward and the per-line demand is simply re-discovered next night). Over a month of a stuck clawback that is 30 permanently-HELD empty batches per merchant, each of which also trips `reconcileStuckBatches`' `overdueUnsent` branch (settlement-payout.service.ts:271-282) with a daily CRITICAL "SLA missed" line. Currently masked only because no production path creates a Refund (see the clawback-unreachable finding); it becomes live the moment one is added.

**Önerilen düzeltme:** Have the sweep find-or-extend the merchant's existing open (CALCULATED/HELD) batch when one exists, and only create a new dated batch when there is none — or skip creating a batch at all when the recompute would produce zero gross and absorb nothing.

### M3 — Nothing ever writes SETTLED, so the stale-payout alarm fires CRITICAL for every SENT batch, every day, forever

**Konum:** `backend/src/modules/settlements/settlement-payout.service.ts:256`

`SENT → SETTLED` is declared in `SETTLEMENT_TRANSITIONS` (settlement-transitions.ts:46) with no writer anywhere, which is acknowledged as out of scope. But `reconcileStuckBatches` selects every `SENT` batch with `sentAt <= now - 3 days` and logs one CRITICAL per batch per day (lines 256-269). Since no batch ever leaves SENT, that set grows monotonically: by month three every merchant's every historical batch is emitting a daily CRITICAL. The alarm that exists specifically to surface a genuinely unreconciled payout will be buried in thousands of lines of its own noise on the day it matters.

**Önerilen düzeltme:** Either bound the alert (e.g. only batches SENT within the last N days, or de-duplicate to a single aggregate line with a count), or add the manual admin `SENT → SETTLED` action so the set can actually drain.

### M4 — Full IBAN/taxId is exposed on two admin surfaces without the audit trail the third one establishes as the invariant

**Konum:** `backend/src/modules/settlements/settlements.service.ts:70`

`MerchantsService.adminGetDetail`'s doc comment (backend/src/modules/merchants/merchants.service.ts:323-334) states the rule for full-IBAN exposure: "ONLY here, ONLY to ADMIN, ONLY with an audit trail", and enforces it by committing the read and its AuditLog row in one transaction. But `SettlementsService.adminGet` selects `{tradeName, legalName, iban}` and is returned unaudited from `GET /api/admin/settlements/:id` *and* from the response of every approve/hold/retry call, and `AdminExportsService.streamMerchantsCsv` (backend/src/modules/admin/admin-exports.service.ts:131-164) streams `legalName, taxId, iban` for every merchant on the platform in one unauthenticated-by-actor bulk download. The doc comment acknowledges both as "already ADMIN-scoped surfaces, not new exposure", which is true for confidentiality — but it means the audit invariant it defines holds in exactly one of the three places the same fields leave the system. A compromised or rogue admin account can bulk-exfiltrate every merchant's bank details via merchants.csv and leave no trace, while viewing one merchant's detail page leaves a permanent record.

**Önerilen düzeltme:** Write an AuditLog row for the CSV export (`merchant.kyc.exported`, with the requested range and row count) and for `adminGet` when the response includes `iban` — or drop `iban`/`legalName` from `SettlementsService.adminGet`'s select, since the settlement detail screen does not need the bank account to display a batch.

### M5 — Four controllers put @Actors on methods instead of the class, so a future handler added without it fails open

**Konum:** `backend/src/modules/notifications/push/push-tokens.controller.ts:22`

`push-tokens.controller.ts`, `notification-preferences.controller.ts` (:18), `user-location.controller.ts` (:24) and `reservations.controller.ts` (:29) carry no class-level `@Actors(...)`; every current handler declares its own, so nothing is reachable by the wrong actor today. But `ActorsGuard.canActivate` returns `true` when no `@Actors` metadata is found (backend/src/modules/auth/guards/actors.guard.ts:31-33), so a handler added to one of these controllers without the decorator is silently reachable by ANY authenticated principal — a MERCHANT or ADMIN token would satisfy a new `/api/me/...` consumer route. This is the exact fail-open direction that `@AllowUnapprovedMerchant()`'s own doc comment (backend/src/modules/auth/decorators/allow-unapproved-merchant.decorator.ts:3-23) argues against for merchant approval; the same reasoning was not applied to actor selection. Concretely: adding a `@Get("profile")` to `push-tokens.controller.ts` and forgetting the decorator hands a merchant's access token read access to a consumer endpoint, and no test or guard would notice.

**Önerilen düzeltme:** Hoist `@Actors("CONSUMER")` to the class on the three `me/*` controllers (each already has uniform actor requirements) and leave only genuine multi-actor handlers to override at the method level — `ActorsGuard` already uses `getAllAndOverride([handler, class])`, so a method-level decorator still wins. `reservations.controller.ts` is genuinely mixed, so instead consider making `ActorsGuard` deny by default and requiring an explicit `@Actors(...)` or `@Public()` on every route.

### M6 — Public holidays are seeded only through 2027 with no re-seed item in any runbook and no admin CRUD

**Konum:** `backend/prisma/migrations/20260814193500_seed_public_holidays_2026_2027/migration.sql:1`

`PublicHolidayService` (`backend/src/modules/settlements/public-holiday.service.ts:26-32`) reads the whole `public_holidays` table and caches it; its own doc comment states there is no admin CRUD surface over the table. The only rows that exist are the 27 seeded by this migration, covering 2026-01-01 through 2027-12-31.

From 2028-01-01 the table simply contains no future holidays, so the 5-business-day payout due-date calculation treats every Turkish public holiday — including a 9-day Kurban Bayramı — as a working day. `dueAt` lands earlier than the real SLA, and the 09:00 reconciliation cron (`settlement-payout.service.ts:246`) starts flagging batches as overdue that are not. Nothing fails loudly; the table just quietly stops describing reality.

The migration's own comment also flags that the three movable religious holidays are *projected* Hijri dates 'subject to a one-day shift on official moon-sighting confirmation' and asks for a follow-up migration — but neither `docs/operations.md` nor `docs/launch-checklist.md` carries that as an item anyone will see.

**Önerilen düzeltme:** Add a dated item to docs/launch-checklist.md (or a 'recurring maintenance' section in docs/operations.md): re-verify the 2026/2027 bayram dates against the Diyanet's confirmed calendar, and seed 2028+ before 2027-10-01. A startup log line when `getHolidayDateKeys()` finds no rows dated later than 6 months out would make the gap self-announcing.

### M7 — membership-renewal cron has no timeZone while its sibling does; the runbook presents both on the same clock

**Konum:** `backend/src/modules/memberships/membership-renewal-cron.service.ts:94`

`settlement-batch-builder.service.ts:215-218` declares `@Cron("0 2 * * *", { name: "settlement-nightly-batch", timeZone: "Europe/Istanbul" })`, and its doc comment at 209-214 asserts the ordering 'before the membership renewal cron (03:00)'. `membership-renewal-cron.service.ts:94` is a bare `@Cron("0 3 * * *")` with no timeZone — as is the 09:00 reconciliation sweep (`settlement-payout.service.ts:246`). No `TZ` is set anywhere in `ops/docker-compose.prod.yml` or `backend/Dockerfile`, so the container runs UTC.

Actual wall-clock in Istanbul: settlement batch 02:00 TRT, membership renewal 06:00 TRT, reconciliation alert 12:00 TRT. `docs/operations.md:70,73,72` lists them as '02:00 Europe/Istanbul', '03:00 daily' and '09:00 daily', which reads as one clock. The intended ordering happens to survive (23:00 UTC precedes 03:00 UTC), so this is not a live bug — but it is exactly the kind of thing that breaks silently if either schedule is ever nudged, and an operator debugging 'why did the renewal not run at 3am' will look in the wrong place.

**Önerilen düzeltme:** Add `timeZone: "Europe/Istanbul"` to the membership-renewal and reconciliation crons to match the batch builder, and state the timezone per row in the operations.md cron table rather than only on the one row that has it.

### M8 — README's dev-up.sh walkthrough omits the one step whose absence breaks a clean clone

**Konum:** `README.md:50`

README.md:50-57 enumerates what `./scripts/dev-up.sh` does in six numbered steps: env files, infra, `npm ci`, prisma generate + migrate deploy, seed, start servers. The script has a seventh step between 3 and 4 — `scripts/dev-up.sh:125-128`, an unconditional `npm run build -w @kurtar/ui-tokens` + `npm run build -w @kurtar/api-client`.

That step is the one the script's own comment (108-123) identifies as mandatory on a clean clone: both packages declare `"main": "dist/index.js"`, `dist/` is gitignored, and neither has a prepare/postinstall hook, so after `npm ci` every `import ... from "@kurtar/api-client"` in merchant-web/admin-web/landing/consumer resolves to a file that does not exist.

Failure scenario: a new engineer reads the README's six steps, decides to run them by hand (or adapts them for a partial bring-up — 'I only need the backend and admin-web'), skips the build, and gets an unresolvable-import crash from three dev servers with no hint that a package build was the missing step. README.md:137 does explain the stale-`dist/` trap in the API-regeneration section, but a reader following the bring-up section never gets there.

**Önerilen düzeltme:** Insert the shared-package build as step 4 in README.md's list, worded to match the script's comment ('builds @kurtar/ui-tokens and @kurtar/api-client — dist/ is gitignored and npm ci does not compile them, so this is not optional on a clean clone').

### M9 — merchant-web's pickup list references two CSS custom properties the token bridge never defines

**Konum:** `apps/merchant-web/src/today/PickupListSection.module.css:27`

`.row` uses `border-bottom: 1px solid var(--color-border)` (line 27) and `.customer`/`.qty`/`.pickupTime` use `color: var(--color-text-secondary)` (lines 44, 49). apps/merchant-web/src/styles/theme.ts only emits `--color-{primary,secondary,neutral,success,warning,danger,info}-*`, `--space-*`, `--radius-*`, `--font-{size,weight}-*` and `--line-height-*`; neither `--color-border` nor `--color-text-secondary` exists anywhere in the app, in global.css, or in @kurtar/ui-tokens.

Result: the `border-bottom` shorthand is invalid at computed-value time and falls to `none`, so the pickup list — the screen a shop owner scans on a phone with a customer waiting — has no separator between rows; and the supporting text (customer name, qty, pickup time) inherits full-strength `--color-neutral-900` instead of a muted tone, flattening the hierarchy against the bold code. Same root cause as the DeadlineBadge finding: nothing checks that a referenced token exists.

**Önerilen düzeltme:** Use `--color-neutral-200` and `--color-neutral-600` (the values every other module in the app uses for exactly these roles), and add the referenced-token check described in the DeadlineBadge finding.

### M10 — The "Manuel teslim" fallback asks the merchant for a value no surface ever shows them

**Konum:** `apps/merchant-web/src/today/PickupListSection.tsx:113`

The manual form's copy is "Müşterinin telefonu çalışmıyorsa, rezervasyon kimliğini girerek teslim edildi olarak işaretleyebilirsiniz" with label "Rezervasyon kimliği" (apps/merchant-web/src/i18n/locales/tr/today.json, pickup.manualBody/manualLabel), and it submits the raw string to `client.reservations.redeem(id)` (apps/merchant-web/src/today/hooks.ts:91-102), which needs the reservation UUID.

But the UUID is never displayed anywhere: the pickup list row renders `item.code`, customer first name, qty, window and status (PickupListSection.tsx:83-99) — never `item.id`; the consumer's redeem screen shows the 6-char `code` in 48px type (apps/consumer/src/app/redeem/[id].tsx:135-137); order row and order detail show `code` too. So the exact scenario the copy names — the customer's phone is dead — is the one in which the merchant cannot possibly obtain a UUID, and typing the code they CAN read yields RESERVATION_NOT_FOUND. The path is only usable by someone reading the database.

This matters more than it looks because apps/consumer/src/lib/redeem-queue.ts:17-24 designates "staff redeeming manually from the merchant-web pickup list" as the only exit from a queued offline swipe.

**Önerilen düzeltme:** Either accept the human `code` on the backend redeem route (or add a lookup-by-code endpoint) and relabel the field "Rezervasyon kodu", or delete the manual form and rely on the per-row "Teslim et" button, which already covers every reservation the list returns.

### M11 — Every deadline badge in a queue table is its own aria-live region

**Konum:** `apps/admin-web/src/components/DeadlineBadge.tsx:70`

`<span role="status">` implies `aria-live="polite"`. ComplaintsListPage renders one per row at PAGE_SIZE = 20 (apps/admin-web/src/features/complaints/ComplaintsListPage.tsx:19, 176-179), and ReportsPage does the same. On a filter change or page change all twenty regions update at once, so a screen-reader user hears twenty countdown sentences queued back-to-back before reaching table content. `role="status"` is right for the single standalone badge on the settlement detail page (SettlementDetailPage.tsx:204-207), not for a repeated table cell.

**Önerilen düzeltme:** Make the live-region behaviour opt-in — e.g. a `live?: boolean` prop that only the detail-page usage passes — and render the table variant as a plain `<span>` with identical text content.

### M12 — Hardcoded Turkish strings outside i18n in the consumer app, which otherwise has exact tr/en key parity

**Konum:** `apps/consumer/src/components/SwipeToConfirm.tsx:90`

apps/consumer/src/i18n/{tr,en}.json are at exact key parity (254 keys each, verified) and every screen reads through `t()`. Four user-visible strings bypass it, all on the purchase→redeem path: `accessibilityHint="Teslim almayı onaylamak için etkinleştir"` (SwipeToConfirm.tsx:90), `accessibilityLabel={`Canlı saat: …`}` (apps/consumer/src/components/LiveClock.tsx:29), `accessibilityLabel="Azalt"` / `"Artır"` on the quantity stepper (apps/consumer/src/app/purchase/[offerId].tsx:113, 123), and the `"Mağaza"` store-name fallback (apps/consumer/src/hooks/use-order-details.ts:106). Three of the four are the only text a VoiceOver/TalkBack user gets for the redeem swipe and the quantity control — exactly the strings a second locale would need most.

**Önerilen düzeltme:** Move all four into tr.json/en.json under the namespaces that already exist (`redeem.*`, `purchase.*`, `orders.*`) and read them through `t()`.

### M13 — The consumer app reconstructs the pickup start time from a hand-mirrored backend constant with nothing tying the two together

**Konum:** `apps/consumer/src/lib/constants.ts:13`

`GET /reservations/mine` returns no pickup window, so the app derives it: `pickupStartAt = cancelDeadlineAt + CANCEL_DEADLINE_BEFORE_PICKUP_MS`, with the 2h constant copied from backend/src/modules/reservations/reservations.service.ts:33. It feeds OrderRow's countdown (apps/consumer/src/components/OrderRow.tsx:47) and use-order-details.ts:110's last-resort branch — i.e. the pickup time shown to every user whose local snapshot is gone (reinstall, new device, cleared storage).

The file's own comment acknowledges the coupling ("if the backend ever changes it, this must move with it"), but nothing enforces it: no shared constant, no contract test, no CI check. A backend change from 2h to 1h would silently show every such user a pickup time one hour late, with no test going red on either side.

**Önerilen düzeltme:** Add `pickupStartAt`/`pickupEndAt` to `ReservationDto` — this also fixes the redeem-window finding and removes the need for purchase-cache.ts's snapshot entirely. Failing that, assert the mirrored constant against the backend's value in a cross-workspace test so the drift is caught rather than documented.

### M14 — The single-offer endpoint added 'for share links' has zero callers; the share-link page still documents it as missing

**Konum:** `landing/app/[locale]/o/[id]/page.tsx:14`

The offer bridge page's doc comment states "There is no public 'get one offer by id' endpoint in the backend today (discovery.controller.ts exposes `offers` (a filtered list) and `stores/:id`, not a single-offer lookup)" and renders a generic app-store bridge instead of a preview. That was true when e10f854 landed, but commit 585963b — "feat(discovery): add the public single-offer read for share links", which is *newer* on this branch — added `GET /discovery/offers/:id` (backend/src/modules/discovery/discovery.controller.ts:38) and `client.discovery.offer` (packages/api-client/src/domains/discovery.ts:20). Neither has a single caller on any surface. Failure scenario: the endpoint built specifically to make shared offer links rich is dead code, and the page it was built for still shows a contentless bridge with a stale comment telling the next engineer the capability doesn't exist.

**Önerilen düzeltme:** Have the offer bridge fetch `client.discovery.offer(id)` server-side for the preview (store name, price, pickup window) and delete the stale gap note; or delete the endpoint.

### M15 — Cross-module stale assumptions: publish-scheduler, CommissionInvoice schema comment, and cron timezones

**Konum:** `backend/src/modules/offers/offers-publish-scheduler.service.ts:16`

Three places where one module still encodes an assumption another module has since changed. (a) The publish scheduler defers jitter because "nothing downstream reacts to offer.published.v1 yet (the outbox worker lands in a later task)" — the outbox worker and `OfferPublishedHandler`'s favorites + nearby fan-out have since landed, so the stated precondition for needing jitter ("a publish burst also means a push-notification burst") is now true and was never revisited. (b) backend/prisma/schema.prisma:1114-1119 documents `MEMBERSHIP` invoices as "the amount offset this batch / 0 / same value — no KDV line", but commission-invoice.service.ts:110-127 now sets a real `vatCents` from `batch.membershipOffsetVatCents` (an explicit reversed policy decision) — the schema and the writer disagree about what a money column means. (c) `settlement-nightly-batch` pins `timeZone: "Europe/Istanbul"` (settlement-batch-builder.service.ts:217) while `membership-renewal` is `"0 3 * * *" // 03:00 server time` (membership-renewal-cron.service.ts:94) and `settlement-reconciliation` is bare `"0 9 * * *"`; the batch builder's own comment asserts an ordering relationship ("before the membership renewal cron (03:00) and the reconciliation alert (09:00)") that is only accidentally preserved under a UTC container clock.

**Önerilen düzeltme:** Update the scheduler comment and decide on jitter now that fan-out exists; correct the CommissionInvoice schema comment; give every daily cron an explicit `timeZone: "Europe/Istanbul"` so the documented ordering holds independently of the container's TZ.

### M16 — Small dead ends: unused client methods, an inert preference toggle, and an invoice status no surface shows

**Konum:** `packages/api-client/src/domains/merchant.ts:45`

`merchant.stores.get` (`GET /stores/{id}`) and `merchant.bagTemplates.get` (`GET /bag-templates/{id}`) have no callers on any surface. `marketingEnabled` is persisted, exposed in the DTO and rendered as a toggle in apps/consumer/src/app/notification-preferences.tsx:151, but no `NotificationKind` in NOTIFICATION_POLICY_TABLE maps to it — consent is captured and never consulted. `commissionInvoices` is included in both the merchant and admin settlement detail responses (settlements.service.ts:72,216) and appears in merchant-web's test fixture (SettlementDetail.test.tsx:72) but is rendered by neither panel; since `MockEDocumentProvider` refuses to register when `NODE_ENV === "production"` (mock-e-document-provider.ts:32) and `NilveraAdapter.issue()` is hard-disabled, every commission invoice in production stays DRAFT with only a logger.error line and no surface or dashboard tile that would reveal it. Also: apps/consumer/src/lib/api-types.ts:1-28's opening comment claims `SuccessBody` resolves to `never` for all 81 operations — that bug was fixed in packages/api-client/src/core-types.ts (the `` `${K}` `` coercion is present), so ~40 hand-typed response shapes are now duplicated for a reason that no longer holds.

**Önerilen düzeltme:** Delete the unused client methods or wire them; either honor `marketingEnabled` with a marketing NotificationKind or hide the toggle; render invoice status somewhere (admin settlement detail is the natural home) and add a DRAFT-invoice count to the admin dashboard; refresh the consumer api-types.ts preamble and migrate its shapes back onto `SuccessBody`.

### M17 — apps/consumer hand-mirrors 261 lines of response DTOs on a stale premise, with no gate keeping them in sync

**Konum:** `apps/consumer/src/lib/api-types.ts:1`

The file header (:4-27) declares every type "ALL hand-typed here, none derived from `@kurtar/api-client`'s `SuccessBody`" because of the "CRITICAL bug" that "`SuccessBody<P, M>` collapses to `never` for ALL 81 operations". That bug is fixed; merchant-web and admin-web both migrated their equivalents to `Awaited<ReturnType<typeof client...>>` projections, consumer did not.

The shapes are all accurate today (I checked `ReservationStatus`, `ComplaintStatus`, `ComplaintCategory` against prisma/schema.prisma and the reservation/complaint/rating/notification DTOs field-for-field), and most are still indirectly checked because the client's real return type has to be assignable to them at call sites like use-order-details.ts:9. So this is drift *risk* plus a misleading 27-line comment, not a live defect — but it's the last copy of a shape the shared client already owns, and the header will send the next reader down a dead investigation.

**Önerilen düzeltme:** Replace each interface with an `Awaited<ReturnType<typeof client...>>` projection (or an indexed access into it) exactly as apps/admin-web/src/api/admin-types.ts now does, and delete the obsolete header.

### M18 — `RequestOptions.signal` is unreachable — no domain method accepts or forwards an AbortSignal

**Konum:** `packages/api-client/src/engine.ts:26`

The engine plumbs `signal` all the way into `fetchImpl` (:153), but none of the 13 domain modules exposes it on any method signature, so no app can cancel an in-flight request. React Query's own `signal` therefore can never reach fetch, and a navigated-away-from screen's request runs to completion. Dead API surface rather than a defect — but note that if it were wired up, an abort would currently reject fetch and, on the refresh path, trip the `onUnauthorized()` bug above (finding 3), logging the user out for a cancelled request.

**Önerilen düzeltme:** Either add an optional `{ signal }` argument to the domain methods that take one, or drop `signal` from `RequestOptions` so the capability isn't implied. If wiring it up, fix the network-failure `onUnauthorized` path first.

### M19 — The money-loop e2e never exercises the shared client

**Konum:** `e2e/tests/money-loop.spec.ts:329`

Every backend interaction in the cross-surface e2e is a raw Playwright `request` call against a hardcoded path string (`"/api/auth/merchant/login"`, `"/api/reservations/mine?page=1&pageSize=20"`, and 12 more). That's a defensible choice for testing the API, but it means the one test that spans all surfaces provides zero coverage of `@kurtar/api-client` — the layer the four apps actually talk through. Every client-level bug in this report (token persistence, single-flight, onUnauthorized semantics) is invisible to it. The browser half does drive the built merchant-web/admin-web, so the cookie-transport login path is covered there; the consumer/body-transport path is not covered anywhere.

**Önerilen düzeltme:** No change required to the test's API half. Worth noting in the workflow comment that the e2e is not client coverage, and worth adding the app-level suites to CI (finding 6) since those are where the client is actually exercised.

