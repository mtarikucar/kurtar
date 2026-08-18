# Backend money-path fix round — report

Scope: the two remaining CRITICALs, five IMPORTANTs and four MINORs in
`backend/src/modules/{settlements,invoicing,memberships}` from
[`open-findings.md`](open-findings.md). Backend only — nothing under
`apps/`, `landing/` or `packages/` was touched.

**Result: 11 of 11 closed.** Two follow-ups are named at the bottom, both
deliberately deferred with reasons, neither of them part of a finding's
stated fix.

| # | Finding | Disposition |
|---|---|---|
| C1 | Extending a HELD batch after a successor's payout orphans the new lines | **Fixed** — line insert moved inside the recompute transaction |
| C2 | Commission invoicing not idempotent under an at-least-once outbox | **Fixed** — `@@unique([batchId, type])` + reuse-or-skip + re-issue with the same id |
| I1 | Failed commission e-invoice is a silent dead end | **Fixed** — rethrow (outbox retries) + daily DRAFT digest to `OPS_ALERT_EMAIL` |
| I2 | Renewal resets `outstandingCents` while an open batch still claims it | **Fixed** — foreign-period guard makes a straddling batch restore-only |
| I3 | Reconciliation alerts on an unclearable state, unbounded | **Fixed** — alert-once sentinels, `LIMIT 500` oldest-first, one aggregate line + digest |
| I4 | Payout deadline: no alert channel, no pre-breach warning | **Fixed** — new one-business-day warning branch + `OPS_ALERT_EMAIL` digests + runbook |
| I5 | Money-moving admin endpoints record no acting admin | **Fixed** — `@CurrentUser` on all five handlers, `AuditLog` in the same transaction |
| M2 | Clawback-only sweep mints an empty HELD batch every night | **Fixed** — recomputes the merchant's existing open batch instead |
| M3 | Stale-payout alarm fires CRITICAL forever for every SENT batch | **Fixed with I3** (shared sentinel work) — see the note on the missing `SETTLED` writer |
| M6 | Public holidays seeded only to 2027, no runbook item | **Fixed** — horizon warning in `PublicHolidayService` + runbook section |
| M7 | Membership-renewal cron has no `timeZone` | **Fixed** — pinned, plus a standing test over every daily cron |

Verification is at the bottom: three full-suite runs the CI way, lint,
prettier, a migration round-trip against real Postgres, schema/migration
parity, and an OpenAPI drift check.

---

## C1 — a refused recompute no longer strands the lines it was given

**What was wrong.** `createOrExtendBatch` committed the new
`settlementLine` rows on the root client, then `recomputeBatch` opened its
own transaction — which can legitimately refuse
(`SETTLEMENT_CARRIED_DEMAND_ALREADY_COLLECTED`, when a very-late line
would cure a HELD batch whose successor already collected the carried
demand and was paid). The refusal rolled back the recompute and left the
lines committed against a batch whose totals never counted them. Nothing
in the codebase can remove or re-point a settlement line, the nightly
eligibility scan skips a reservation that has one (`settlementLine:
null`), and both admin actions re-enter the same recompute and re-throw —
so the merchant could never be paid for that redemption, and the batch was
wedged.

**Fix.** `backend/src/modules/settlements/settlement-batch-builder.service.ts`

- `createOrExtendBatch` now returns `{ batchId, pendingLines }` and writes
  no lines (new exported `PendingSettlementLine`).
- `recomputeBatch(batchId, now, pendingLines = [])` inserts them
  (`skipDuplicates: true`, unchanged concurrency semantics) **inside its
  own transaction**, deliberately *after* the recomputable /
  `payoutAttemptedAt` guard — a batch that froze in the gap must not
  receive lines it will never count either; that case logs a warning and
  leaves the reservations eligible.
- The two nightly call sites thread the rows through; `settlements.service`'s
  approve/retry pass none.

So a refusal now commits nothing: the reservations keep
`settlementLine: null`, the next cycle re-discovers them, and the
reconciliation item announces itself every night until an operator
resolves it — instead of going quiet with an unpayable line.

**Transaction-boundary note (the caller asked for this explicitly).** The
change does move a write into a longer-lived transaction. It does not
widen the lock set: the insert only ever touches rows for reservations
this pass computed, `recomputeBatch` already held `FOR UPDATE` on the
batch and on every locked line, and `skipDuplicates` (`ON CONFLICT DO
NOTHING`) keeps the concurrent-duplicate behaviour the previous code
relied on. No provider or HTTP I/O was moved inside a transaction.

**Test.** `settlements.realdb.spec.ts` `[n]`, re-pointed at the corrected
invariant — the finding predicted this and it is the whole point:

- `settlementLine.count({ batchId: bB1.id })` `2` → **`1`**;
- the very-late reservation has **no** settlement line at all;
- **new**: the next nightly cycle re-reports the same refusal for that
  merchant and the reservation is still line-less. Without the fix that
  second cycle reports *nothing* — the reservation was permanently
  invisible to the eligibility scan and permanently uncounted by the batch
  holding it.

**Revert-proof** (`git stash push settlement-batch-builder.service.ts`,
then `jest settlements.realdb.spec.ts`):

```
✕ [k] ... the demand still visible to the recovery sweep (270 ms)
✕ [n] ... refuses to commit instead of silently under-paying (589 ms)
Tests:       2 failed, 13 passed, 15 total
```

(`[n]` fails on `Expected: 1 / Received: 2` — the orphaned line. `[k]`
fails on the M2 half of the same file; see below.)

---

## C2 — commission invoicing is idempotent per (batch, type)

**What was wrong.** An unconditional `commissionInvoice.create`, no unique
constraint, and `invoice.id` — freshly minted per run — passed to the
provider as its idempotency key. Both outbox redelivery paths are live (a
throwing handler is retried; a handler whose `markDone` fails is left for
the stale-lease reclaim), so a redelivery drafted a second row with a new
id, the provider's own dedupe could not see it, and a second legally valid
e-fatura was issued for the same batch. Nilvera is a real provider
selected by `EDOC_PROVIDER` and the mock refuses to register in
production, so this reaches real tax documents.

**Fix.**

- `backend/prisma/schema.prisma`: `@@unique([batchId, type])` on
  `CommissionInvoice` (+ the stale "MEMBERSHIP has no KDV line" comment
  corrected — it contradicted the writer since the P2 policy change).
- Migration `20260818090000_commission_invoice_batch_type_unique`
  (up: `CREATE UNIQUE INDEX IF NOT EXISTS`; down: `DROP INDEX IF EXISTS`).
  `batchId` is nullable and Postgres's default `NULLS DISTINCT` is what we
  want — invoices orphaned by a deleted batch must not collide.
- `commission-invoice.service.ts`: `findOrCreateDraft` reads the
  `(batchId, type)` row first and adopts the winner's row on `P2002`
  (the genuine two-worker race); an already-`SENT` invoice returns without
  touching the provider; a still-`DRAFT` one is re-issued with the **same**
  `invoice.id`, which the `EDocumentProvider` contract requires adapters to
  dedupe.
- The post-issue `update` moved **out** of the `issue` try-block, with its
  own CRITICAL message: "WAS ISSUED at the provider … but recording that
  failed". Previously that case was logged as "drafted but issuance failed
  — left DRAFT", the exact opposite of the truth, on the one branch that
  carries a tax consequence.

**Tests.** Four new unit tests in `commission-invoice.service.spec.ts`
(the fake `commissionInvoice` table is now a real store, so a second
`createInvoicesForSentBatch` call *is* a redelivery), plus a new realdb
spec `commission-invoice-unique.realdb.spec.ts` proving Postgres itself
refuses the duplicate while still allowing the other type on the same
batch and the same type on another batch.

**Revert-proof, service** (`git stash push commission-invoice.service.ts`):

```
✕ skips entirely ... for an invalid merchant taxId, and raises an ops alert
✕ [Fix round #6, I1] leaves the invoice DRAFT and RETHROWS when issuance fails
✕ [Fix round #6, C2] a redelivery of the same event never drafts a second invoice
✕ [Fix round #6, C2] retries a still-DRAFT invoice with the SAME invoice id
✕ [Fix round #6, C2] adopts the row a concurrent dispatch created (P2002)
✕ [Fix round #6, C2] an issued-but-unrecorded invoice is reported as ISSUED
Tests:       6 failed, 8 passed, 14 total
```

**Revert-proof, migration** (apply the migration's own `down.sql`, run the
realdb spec, re-apply the up):

```
✕ refuses a SECOND invoice of the same type for the same batch ... (18 ms)
    Received: null          <- no error at all; the duplicate insert succeeded
Tests:       1 failed, 1 total
```

---

## I1 — a failed e-invoice now retries and is alerted on

- `createAndIssue` **rethrows** instead of swallowing, so the outbox's
  existing backoff/DEAD ladder engages. Safe only because C2 landed first —
  before it, retrying would have duplicated tax documents.
- New `CommissionInvoiceDraftAlertService` (10:00 Europe/Istanbul, bounded
  500, oldest-first): every invoice still `DRAFT` >6h after drafting goes
  out as an `OPS_ALERT_EMAIL` digest. Deliberately **no** sentinel, unlike
  the settlement alerts: a DRAFT invoice clears itself the moment issuance
  succeeds, so a daily reminder is an open work item rather than an
  unclosable alarm.
- The invalid-taxId branch stays non-throwing (a retry cannot fix bad
  master data) but now raises the same digest instead of only logging.
- New shared `OpsAlertService` (`notifications/email/`, exported by
  `EmailModule`) — the third and fourth copy of the digest helper the two
  SLA crons had inlined; never throws, degrades to a log line when
  `OPS_ALERT_EMAIL` is unset. New `templates/emails/ops-alert.hbs`.
- The new cron is added to the standing registration gate
  (`settlement-cron-registration.realdb.spec.ts`).

**Revert-proof:** covered by the C2 stash above — the rethrow test
(`leaves the invoice DRAFT and RETHROWS…`) and the ops-alert assertion on
the invalid-taxId test both fail against the old service.

---

## I2 — a straddling batch can only restore, never collect

**What was wrong.** `lockAndResolveDue` received `periodDate` but used it
only for the exemption comparison; `currentPeriodStart`/`currentPeriodEnd`
were read by the `SELECT *` and never consulted. Renewal resets
`outstandingCents` to the new period's full price while an open
CALCULATED/HELD batch from the period that just ended is still
recomputable (approve's pre-lock recompute, retry, or a late line), so
that recompute read the *new* period's balance as its due and collected
against it out of the *old* period's gross.

**Fix.** `membership-offset.service.ts`: new `foreignPeriod` flag
(`periodDate < currentPeriodStart || periodDate >= currentPeriodEnd`),
treated exactly like `exempt` — `dueCents`/`dueVatCents` become
restore-only, and `persistOffset` writes no lifecycle flags
(`periodPaidAt`, activation) on the new period's behalf.

**Test.** New realdb scenario in `memberships.realdb.spec.ts`: a
period-1 batch offsets its 600, renewal opens period 2 with a fresh
balance, then the batch is recomputed. It must still offset exactly 600,
keep `netPayoutCents` 19200, and leave period 2's balance, `periodPaidAt`
and status untouched — and converge on a further recompute.

**Revert-proof** (`git stash push membership-offset.service.ts`):

```
✕ [Fix round #6, I2] a batch from the period that just ended may only RESTORE
  what it already offset ... (144 ms)
    Expected: 600
    Received: 19800     <- year 2's fee collected out of year 1's payout
Tests:       1 failed, 6 passed, 7 total
```

---

## I3 + M3 + I4 — the reconciliation sweep, solved once

Treated as one piece of work, as instructed.

**Fix.** `settlement-payout.service.ts` + migration
`20260818091000_settlement_payout_alert_sentinels` (three nullable
sentinel columns on `settlement_batches`; down drops exactly those three).

1. **Alert-once.** Each branch claims its rows with a guarded
   `UPDATE … WHERE <sentinel> IS NULL … RETURNING`, the same atomic shape
   `complaint-sla-cron` uses. The stale-SENT branch in particular could
   never be cleared (nothing writes `SETTLED`), so it re-emitted the same
   CRITICAL lines every day forever and buried the payout-SLA branch in
   the same method at the same level.
2. **Bounded and ordered.** `LIMIT 500` + oldest-first on all three
   queries, matching the sibling sweeps.
3. **One aggregate log line per branch** instead of one per row.
4. **New pre-breach branch (I4)**: batches still unsent one *business* day
   before `dueAt`, computed with the same `addBusinessDays` helper that
   produced `dueAt`. Warning and breach have separate sentinels, so a batch
   that crosses its deadline between ticks still gets the breach alert.
5. **A channel (I4)**: all three go out as `OPS_ALERT_EMAIL` digests via
   `OpsAlertService`, degrading to the log line when unset. The payout SLA
   was the only regulated clock with no email channel.
6. Cron entry split from the callable method and wrapped, so a failed tick
   cannot vanish inside `@nestjs/schedule`; `timeZone` pinned (M7).
7. `docs/operations.md`: the cron row rewritten to describe all three
   branches, and "When a payout fails" gained the deadline-alert and
   audit-trail steps.

**Test.** New `settlement-reconciliation.realdb.spec.ts` — real Postgres,
since the sentinel claiming is raw `UPDATE … RETURNING`. Four seeded
batches (stale-SENT, due-soon, overdue, control); asserts each sentinel is
stamped, the control is untouched, each id reaches a digest, and the
**second** run re-alerts none of them. All assertions are scoped to this
file's own batch ids — never a table-wide count.

**Revert-proof** (`git stash push settlement-payout.service.ts`):

```
✕ alerts each condition exactly once, warns BEFORE the payout deadline ... (15 ms)
    Matcher error: received value must be a number or bigint
    Received has value: undefined      <- `dueSoonCount`: the branch did not exist
Tests:       1 failed, 1 total
```

---

## I5 — every money-moving admin action records who acted

**Fix.**

- `admin-settlements.controller.ts`: `@CurrentUser("id") adminId` on
  `runNightly`, `approve`, `hold`, `retry`; `admin-pricing.controller.ts`:
  same on `schedule`.
- `settlements.service.ts`: `adminApprove` and `adminHold` now run their
  guarded `updateMany` **and** the `auditLog.create` in one `$transaction`
  (`settlement.approved` / `settlement.held`); `adminRetry` records
  `settlement.retried` before acting (its effect is a recompute or a
  provider call, neither of which may share a transaction);
  `adminRunNightlyCycle` records `settlement.nightly_run` against the
  cycle (`entity: "SettlementCycle"`, `entityId` = the Istanbul day key)
  with the touched batch ids and per-merchant failures as the diff.
- `pricing.service.ts`: `scheduleFuturePricing(params, adminId)` writes
  `pricing.scheduled` in the same transaction as the row.
- No migration — `AuditLog` already exists and is written from seven other
  modules. No OpenAPI change (param decorators only) — verified below.

**Test.** New `settlement-admin-audit.realdb.spec.ts`: one test per action
asserting the row's `actorType`/`actorId`/`action`/`diffJson`, that a
**refused** hold records nothing (the transaction holds in both
directions), and a controller-level test that the acting admin is passed
in the right **position** — both ids are strings, so a swap type-checks and
would file every action under a batch id as its actor.

**Revert-proof** (`git stash push settlements.service.ts pricing.service.ts
admin-settlements.controller.ts admin-pricing.controller.ts`):

```
✕ approve records settlement.approved with the acting admin ... (148 ms)
✕ hold records settlement.held with the admin's own note ... (31 ms)
✕ retry records settlement.retried, and run-nightly records settlement.nightly_run
✕ scheduling platform pricing records pricing.scheduled with the acting admin
✕ the admin controllers bind the acting admin and pass it through in the right position
    Expected length: 1
    Received length: 0
Tests:       5 failed, 5 total
```

---

## M2 — the clawback-only sweep stops minting empty batches

The sweep always built for `todayKey`, a different `(merchantId,
periodStart)` key every night, so a merchant whose clawback demand cannot
be absorbed collected one brand-new empty HELD batch per night forever —
each of which chains nothing forward and eventually fires its own payout
SLA alert. It now recomputes the merchant's most recent open
(CALCULATED/HELD) batch when there is one, and only mints a batch when
there is none. Nothing is lost: the demand stays visible to the same scan,
and `discoverCarriedDemandSource` looks for the most recent HELD batch —
it never depended on the sweep's litter.

**Test.** `settlements.realdb.spec.ts` `[k]`: the batch count after the
sweep is `3` → **`2`**, and the returned `batchIds` contains the existing
batch. The rest of that test needed a successor batch to exercise the
round-#5 claim ledger, which the sweep no longer provides; it is now
seeded explicitly (`seedEmptyOpenBatch`, the exact row shape
`createOrExtendBatch` produces) and every subsequent assertion is
unchanged.

**Revert-proof:** the C1 stash above — `[k]` fails on the batch count.

---

## M6 — the holiday calendar announces its own exhaustion

`PublicHolidayService.getHolidayDateKeys` warns when the last seeded
holiday is less than ~6 months out, and logs an error when the table is
empty. Once the calendar (last row: 2027-10-29) runs out, nothing breaks
loudly — `isBusinessDay` just treats every bayram as a working day and
`dueAt` lands *earlier* than the real 5 business days, i.e. the platform
starts breaching its own payout promise on paper. `docs/operations.md`
gained a "Public holiday calendar" section with the dated re-seed item
(2028+ before 2027-10-01) and the Diyanet/moon-sighting re-verification
note.

**Test.** Three cases in `public-holiday.service.spec.ts` (warns near the
horizon, silent with a long horizon, errors when empty).

## M7 — daily crons are pinned to Europe/Istanbul

`membership-renewal` and `settlement-reconciliation` now carry
`timeZone: "Europe/Istanbul"` (the container is UTC — no `TZ` anywhere —
so `0 3 * * *` was firing at 06:00 Istanbul while the runbook presented
all three crons on one clock). Every row of the runbook's cron table now
carries its timezone, and the hourly/5-minute ones are marked as having no
wall-clock meaning.

**Test.** `settlement-cron-registration.realdb.spec.ts` now asserts the
`timeZone` of every **daily** job against a real `AppModule` boot, so a
future daily cron shipping unpinned fails the same standing gate that
already catches an unregistered one.

**Revert-proof, M6 + M7** (`git stash push membership-renewal-cron.service.ts
public-holiday.service.ts`):

```
expect(received).toEqual(expected)  // { name: "membership-renewal", timeZone } 
  - Expected  - 1
  + Received  + 1
Expected number of calls: 1
Received number of calls: 0     <- the holiday-horizon warning
Tests:       3 failed, 5 passed, 8 total
```

---

## Verification

All commands run from `backend/` with the CI environment
(`TEST_DATABASE_URL`/`DATABASE_URL` → PostGIS on 4754, `REDIS_URL` → 4755).

**Full suite, the CI way, three times** (baseline before this work was
108 suites / 945 tests):

```
$ npx jest --runInBand
Test Suites: 111 passed, 111 total
Tests:       960 passed, 960 total
Time:        28.238 s

$ npx jest --runInBand
Test Suites: 111 passed, 111 total
Tests:       960 passed, 960 total
Time:        26.889 s

$ npx jest --runInBand          # after the migration round-trip below
Test Suites: 111 passed, 111 total
Tests:       960 passed, 960 total
Time:        27.945 s
```

**Migration reversibility** — both new migrations, up → down → (re-run
down, i.e. idempotence) → up, against the real database:

```
--- after down: columns / index should be absent ---
0
0
--- re-run downs (idempotence) ---
NOTICE:  column "reconciliationAlertSentAt" of relation "settlement_batches" does not exist, skipping
NOTICE:  column "payoutDueWarningSentAt" of relation "settlement_batches" does not exist, skipping
NOTICE:  column "payoutOverdueAlertSentAt" of relation "settlement_batches" does not exist, skipping
down#2 re-run OK
NOTICE:  index "commission_invoices_batchId_type_key" does not exist, skipping
down#1 re-run OK
All migrations have been successfully applied.
--- after re-up ---
3
1
```

...and the whole chain, exactly as `quality-gates.yml` runs it (revert
every `down.sql` in reverse order, drop the ledger, redeploy):

```
Reverting every migration's down.sql, reverse chronological order...
  - reverting 20260818091000_settlement_payout_alert_sentinels
  ...
All migrations have been successfully applied.
Round-trip OK
```

**Schema ↔ migrations parity** (`prisma migrate diff --from-migrations
--to-schema-datamodel`) — only the one divergence CI already allows:

```
-- DropIndex
DROP INDEX "store_location_gist";
```

**OpenAPI contract drift** — regenerated and diffed against the committed
copy; no change, so `packages/api-client`'s generated types stay valid and
nothing outside `backend/` needed regenerating:

```
openapi:generate — wrote /home/tarik/Projects/kurtar/docs/openapi.json (82 unique paths, 90 operations).
NO OPENAPI DRIFT
```

**Lint / format:**

```
$ npx eslint "src/**/*.ts"          # no output
$ npx prettier --check "src/**/*.ts"
All matched files use Prettier code style!
```

---

## Not closed

Two items, neither of them part of a finding's prescribed fix, both named
here rather than half-done:

1. **Nothing still writes `SETTLED`.** M3's "ideally also add the manual
   admin `SENT → SETTLED` action so the set can actually drain" is not
   done. It needs a new endpoint, and a new endpoint changes
   `docs/openapi.json` **and** `packages/api-client/src/generated/openapi-types.ts`
   — `packages/` is outside this task's lane (another agent is working
   there concurrently), and shipping the backend half alone would leave
   the api-client drift gate red. What *is* fixed is the consequence the
   finding is about: the alert no longer fires forever. It now fires once
   per batch, as a prompt to reconcile with the bank/PSP manually, and the
   runbook says so explicitly. The endpoint is a clean follow-up: the
   transition map already permits `SENT → SETTLED`.
2. **I2's own stated residual.** When a straddling batch's availability
   shrinks so its restore is clamped, `persistOffset`'s `stored +
   batchPrior - applied` still credits the released kuruş onto the *new*
   period's balance rather than the write-off ledger. The finding calls
   this out as "worth a follow-up note, not a blocker"; the double-charge
   it sits next to is closed, and this residual moves money in the
   merchant's favour, not the platform's.
