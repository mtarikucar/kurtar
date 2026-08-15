# 3. The settlement ledger: allocations are a table, not a computed number

## Status

Accepted (Task 8, five fix rounds — see `.superpowers/sdd/.../progress.md`'s Task 8 entries for the full incident history this decision closes).

## Context

A settlement batch's `refundClawbackCents` (money to recover from a refund landing after the original line was already paid out) and `inheritedExternalDemandCents` (a shortfall handed forward from a HELD predecessor batch) both need to be **re-derivable** every time a batch is recomputed (an admin retry, a HELD batch curing itself, a new day's lines being added) — recomputation, not a one-shot calculation, is how this system stays correct under real-world edits.

The first implementation tracked both as **plain mutable columns**, inferring "how much has already been recovered" by reading the batch's own previous output back as an input. That inference has no inverse: once a second batch touched the same line, the first batch's contribution was unrecoverable, and a recompute could not tell "I already claimed this" from "this was never claimed." Four independent audit rounds found the same defect class, each one column over from the last — silently forgiving money the platform was still owed (or, in the carried-demand case, charging a merchant twice for a shortfall its predecessor had already resolved).

## Decision

Two append/delete ledger tables replaced the inferred columns:

- **`SettlementClawbackAllocation`** (`batchId`, `reservationId`, `amountCents`) — one row per (batch, line) saying "this batch withheld this much of this line's clawback demand." A recompute **deletes every row it owns, then re-derives from scratch and re-inserts** — so what it reads back afterward is, by construction, "what OTHER batches have recovered," never its own prior output. A batch can never mistake its own earlier pass for an untouched input, because that input literally doesn't exist between the delete and the re-insert.
- **`SettlementCarriedDemandClaim`** (`claimantBatchId` as the PK, `sourceBatchId`, `amountCents`) — the same pattern for the OTHER half of the same problem: a HELD predecessor's shortfall, handed to its successor. The claimant deletes its own row before re-deriving, re-reads the predecessor's *current* exportable demand, and re-inserts only what's still justified — so a predecessor that later cures its own deficit exports 0, and the claim simply isn't re-created, instead of the successor holding a frozen, stale claim on money that's no longer owed.

Both tables carry a real invariant, asserted inside the recompute transaction before commit (`assertLedgerIdentity`): `batch.refundClawbackCents === (inherited − carried) + SUM(this batch's own allocations)`, and equivalently for the carried-demand side. A violation aborts the transaction rather than committing a number the ledger disagrees with.

## Consequences

- **The defect class this closes is structurally impossible now, not just fixed at each instance found.** "Delete my own rows, re-derive, re-insert" means a recompute is *incapable* of reading its own prior output as an input — there's no code path where that could happen, versus the old code where remembering not to was the only thing preventing it.
- **A settlement batch is reconstructible from the ledger at any point** — "what did batch X actually claim, and from where" is a direct query, not something an operator has to reverse-engineer from a single mutable total.
- **More writes per recompute** (delete-N-then-insert-N instead of one column update) — an accepted, small cost for a money-correctness guarantee on the platform's core financial output.
- **The carried-demand half is CONTAINED, not fully eliminated**, for one specific case: a claimant already `APPROVED`/`SENT`/`SETTLED`/`FAILED` holds committed money, and curing the source afterward has no credit-term to apply (`computeSettlement` doesn't have one) — this refuses to silently under-pay rather than pretending a fix exists; see the parked ruling in the ledger ("approve/cure race") and `docs/launch-checklist.md`'s deferred-minor items.
