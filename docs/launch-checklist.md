# Launch checklist — before real money flows

Everything below must be true before kurtar takes a real customer's real payment. Each item names **who** owns it. Items marked **[ENGINEER]** are implementation work this codebase is ready for but that needs a real credential/decision to switch on; items marked **[FOUNDER]**/**[LAWYER]**/**[ACCOUNTANT]** are business/legal/regulatory work outside this repository. Nothing here is optional — this list was built from what the four-surface build actually surfaced, not guessed in advance.

## Legal & regulatory (ETAHS — Turkey's e-commerce intermediary law, no.6563)

- [ ] **[LAWYER]** A Turkish lawyer specializing in e-commerce/consumer law (ideally also KVKK-experienced) reviews all five legal documents in `landing/content/legal/`: `aracilik-sozlesmesi.ts` (intermediation agreement), `mesafeli-satis-sozlesmesi.ts` (distance sales), `on-bilgilendirme-formu.ts` (pre-contract information), `kvkk-aydinlatma-metni.ts` (KVKK disclosure), `cerez-politikasi.ts` (cookie policy). **None of these has been reviewed by counsel** — they are engineering-written drafts grounded in the actual backend behavior (real fees, real deadlines), not a substitute for legal review. See `landing/content/legal/README.md` for the full list of open items per document, including the ETAHS-mandated minimum-content checklist for intermediation agreements specifically.
- [ ] **[FOUNDER]** Fill in every `[BRACKETED PLACEHOLDER]` in those five documents (legal entity name, MERSİS number, tax ID, KEP address, registered office, contact channels, notice periods) once the contracting entity (A.Ş.) exists.
- [ ] **[FOUNDER]** Incorporate the contracting entity (Anonim Şirket via MERSİS), open a bank account, engage a mali müşavir (accountant), and register a KEP (registered electronic mail) address (~₺215/year).
- [ ] **[FOUNDER]** ETBİS registration (Elektronik Ticaret Bilgi Sistemi) — a legal prerequisite to operate as an e-commerce intermediary under ETAHS. **Do not tag a production release until ETBİS + KEP registration are both complete** — this is the single hardest legal gate and should be started as early as possible (weeks of lead time).
- [ ] **[LAWYER]/[FOUNDER]** VERBİS registration (KVKK data controller registry) — or confirm and document the specific exemption that applies, before `kvkk-aydinlatma-metni.ts` is published as final.
- [ ] **[FOUNDER]** Re-run the legal review any time a commercial figure changes (bag fee, membership price, founding-member terms, payout SLA) — the legal documents and `landing/messages/{tr,en}.json`'s `merchants` copy must never drift apart from what the backend actually enforces.

## Tax — withholding & KDV (mali müşavir sign-off required)

- [ ] **[ACCOUNTANT]** Sign off on the withholding tax (%1 stopaj) base as currently implemented: **the merchant's actual earning per line** (gross minus the platform's fixed bag fee and that fee's own KDV), not the raw sale price — see `backend/src/modules/settlements/settlement-math.ts`'s module doc comment for the exact GVK md.94 (as amended by Law 7524) citation this was built against. This is a policy decision that shipped as an engineering judgment call and needs a real accountant's confirmation before it processes real money.
- [ ] **[ACCOUNTANT]** Separately: confirm whether **the platform's own KDV** belongs inside that withholding base or not — this is explicitly a distinct question from the one above (the base could be "correct" on the fee-deduction question and still wrong on this one). Put both questions to the accountant separately, not folded into one general sign-off.
- [ ] **[ACCOUNTANT]** Confirm the membership-fee KDV treatment (₺1.990/year + %20 KDV, tracked end-to-end through `MembershipSubscription`/`SettlementBatch.membershipOffsetVatCents`/`CommissionInvoice`) and the forgiveness-at-renewal policy (an unpaid membership balance is written off, not carried forward, when a subscription rolls to its next annual period — audited via `AuditLog` + `MembershipSubscription.writtenOffCents`) match real accounting practice.
- [ ] **[FOUNDER]** Confirm e-Fatura mükellefiyeti (e-invoice taxpayer obligation) status and timeline — this determines when the Nilvera e-document adapter (see below) must actually go live versus stay inert.

## Payments — replacing the mock provider

- [ ] **[FOUNDER]** Complete PSP marketplace/sub-merchant onboarding — **iyzico Pazaryeri** is the primary target (per the business plan), **PayTR** the documented fallback. This is on the critical path: onboarding review historically takes weeks. `PAYMENT_PROVIDER` already accepts `"iyzico"`/`"paytr"` as valid enum values in `env.validation.ts`, but **no adapter is implemented for either** — `PaymentProviderRegistry.get()` 404s the first real request until one is written.
- [ ] **[ENGINEER]** Implement the real `PaymentProvider` adapter (`backend/src/modules/payments-core/adapters/`) once PSP credentials exist: real webhook HMAC signature verification (the mock's shared-secret-header check is explicitly a stand-in — see `mock-payment-provider.ts`'s doc comment), real `createIntent`/`queryStatus`/`refund`/`payout` calls.
- [ ] **[ENGINEER]** `PAYMENT_PROVIDER=mock` is already refused at boot when `NODE_ENV=production` (`env.validation.ts`) — this is a real safety rail, not just documentation. Confirm the real adapter passes the same realdb test suite the mock currently does before flipping the env var in production.
- [ ] **[FOUNDER]/[ENGINEER]** Decide and implement **taxId/IBAN uniqueness policy** — currently unconstrained (deliberately deferred at Task 5: a public-signup unique constraint on taxId/IBAN is itself a squatting-DoS vector). At real scale this needs a dedup/merge policy, not silence. Until then, admin approval reviewing `docsJson` is the *sole* identity control — record that as a known limitation, not an oversight.

## E-documents (Nilvera)

- [ ] **[FOUNDER]** Contract with Nilvera (or confirm the chosen e-document provider) for e-Fatura/e-Arşiv Fatura issuance.
- [ ] **[ENGINEER]** Set `NILVERA_API_KEY` + `NILVERA_API_URL` — the adapter is deliberately **inert** without both (never registers; `EDOC_PROVIDER=nilvera` without credentials 404s the first real issuance rather than attempting a request with undefined auth). Unlike the payment/SMS/push providers, `EDOC_PROVIDER=mock` is **not** refused at boot in production — this is a conscious gap (Nilvera e-invoicing needs certification before go-live) that must be closed before real commission invoices are legally required.

## Real credentials — SMS, email, push

- [ ] **[FOUNDER]** Procure NetGSM credentials (recommended for Turkish delivery — `NETGSM_USERCODE`/`NETGSM_PASSWORD`/`NETGSM_MSGHEADER`) or Twilio (`TWILIO_*`) as the international fallback.
- [ ] **[ENGINEER]** Set `SMS_PROVIDER=netgsm` (or `twilio`) — `SMS_PROVIDER=mock` is refused at boot in production (`env.validation.ts`); this is already enforced, just needs real credentials.
- [ ] **[ENGINEER]** Set real SMTP credentials (`EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASSWORD`/`EMAIL_FROM`) — also refused as log-only in production.
- [ ] **[ENGINEER]** Set `PUSH_PROVIDER=expo` (already implemented, real) + optionally `EXPO_ACCESS_TOKEN` for Expo's enhanced-security push mode.
- [ ] **[ENGINEER]** Set a real `OPS_ALERT_EMAIL` — without it, the complaint-SLA and content-report-takedown crons still enforce their deadlines (escalate on breach, log at `error`) but skip the human-facing alert.

## Infrastructure

- [ ] **[ENGINEER]** Generate real, random `JWT_SECRET` and `WEBHOOK_SECRET` for production — never the `.env.example` placeholder values. Both are boot-required (`env.validation.ts`).
- [ ] **[ENGINEER]** Set `CORS_ALLOWED_ORIGINS` explicitly in production to the real merchant/admin/landing origins — an unset value means **no CORS at all** in production (deliberate fail-closed default; see `main.ts`).
- [ ] **[ENGINEER]** Off-site backup upload (rclone/S3) — `scripts/backup-database.sh` only writes to local disk today; this is a named, tracked gap, not an oversight (see its own TODO comment).
- [ ] **[ENGINEER]** Document and rehearse a monthly restore drill (restore into a scratch DB, diff row counts) — not yet done even once.
- [ ] **[ENGINEER]** Confirm `docker-compose.prod.yml`'s DB/Redis ports stay `127.0.0.1`-bound (never publicly exposed) on the real production host, matching the compose file's own intent.

## App store submissions (consumer app)

- [ ] **[FOUNDER]** Apple D-U-N-S number — on the critical path, historically weeks of lead time; start this as early as ETBİS.
- [ ] **[ENGINEER]** EAS Build/Submit pipeline for `apps/consumer` (not yet set up — the app currently only runs via `expo start`/local builds).
- [ ] **[ENGINEER]** App Store review note addressing Guideline 3.1.3(e) (physical goods/services purchased outside the app is exempt from Apple's in-app-purchase requirement) — the payment flow is a WebView redirect to the PSP, never a native purchase; document this explicitly in the review notes to avoid a rejection-and-resubmit cycle.
- [ ] **[FOUNDER]** Google Play Console setup + Data Safety form (matches what's actually collected: phone, location for discovery, payment routed to the PSP).

## Pilot acceptance criteria (before scaling past a closed pilot)

From the business plan — these are the numbers that decide "ready for public launch," not a technical gate this codebase can self-certify:

- [ ] **[FOUNDER]** ≥95% successful redeem rate.
- [ ] **[FOUNDER]** Zero lost money — PSP reconciliation clean (ties to the settlement reconciliation cron already running; see `docs/operations.md`).
- [ ] **[FOUNDER]** Payouts consistently ≤5 business days (the system enforces the calculation; a human must confirm it's actually happening end to end with a real PSP).
- [ ] **[FOUNDER]** Sell-through rate ≥50%, redeem/pickup rate ≥60%.
- [ ] **[FOUNDER]** ETBİS + KEP + the full legal document set complete (see above).

## Deferred-minor items (from the engineering review ledger — real, tracked, not launch-blocking on their own, but worth a conscious decision before scale)

- [ ] **[ENGINEER]** A rare concurrent-admin-action race exists between approving a settlement batch and curing its held predecessor (documented at the guard site in `settlements.service.ts`) — real, but needs two admins racing one merchant's batches simultaneously to trigger; not fixed, ruled acceptable at current scale.
- [ ] **[ENGINEER]** `RefundBatchOutcome` conflates a fully-done refund with a sent-but-unconfirmed one under one `ok: true` result — cosmetic for now, revisit if refund reconciliation ever needs to distinguish the two.
- [ ] **[ENGINEER]** Merchant signup has a (throttled) email-enumeration oracle — accepted as a standard, low-risk B2B tradeoff; revisit if merchant signup ever becomes a higher-value target.
- [ ] **[ENGINEER]** Founding-member commercial terms (`Merchant.bagFeeCentsOverride`, `membershipExemptUntil`) are DB-only — no admin UI exists to set them; every use so far has been a direct, audited database write. Build an admin UI before this needs to happen more than a handful of times.
- [ ] **[ENGINEER]** A corner-case settlement batch can become permanently unsettleable with a stranded line if a very specific sequence of holds/recomputes occurs (documented, parked ruling, not reproduced in practice) — worth a monitoring query (a batch stuck `HELD` for >N days with no `holdReason` movement) rather than a code fix.

## This task's own known limitations (Task 14)

- [ ] **[ENGINEER]** `docker compose -f ops/docker-compose.yml down -v` (full volume teardown) was not exercisable in this task's sandboxed environment (destructive-command policy) — the equivalent proof (drop + recreate the database directly, reapply all 14 migrations from zero, full 914-test suite green) was run instead. Run the literal `down -v` + `dev-up.sh` sequence once, for real, before relying on this as fully proven.
- [ ] **[ENGINEER]** `.github/workflows/quality-gates.yml`'s new `e2e-money-loop` job was validated by running the equivalent steps by hand (build, migrate, seed, boot, Playwright) — `actionlint` itself was not available in this environment to lint the YAML directly (same limitation noted by an earlier task in this project's history). Run one real CI execution and one `actionlint` pass before treating the job definition as final.
