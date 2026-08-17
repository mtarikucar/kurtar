# 5. The transitions-map-drives-enforcement convention

## Status

Accepted (Task 5 onward — every stateful entity added since follows this).

## Context

Kurtar has five separately-evolving state machines: `Reservation.status` (7 states), `DailyOffer.status` (6), `MerchantVerificationStatus` (6), `SettlementStatus` (7, with `HELD` as a side branch), `ComplaintStatus`/`ReportStatus`. Every one of them is mutated from more than one call site — a reservation moves via the create path, the webhook/sweeper settle path, the cancel endpoint, and the redeem endpoint, all in different files — and every one of those call sites needs to guard its write with "only if the row is currently in a status this transition is actually legal from."

The naive way to write that guard is to hand-type the allowed `WHERE status IN (...)` list at each call site. That works until two call sites' lists quietly drift apart — one gets updated when a new status is added, the other doesn't — and the drift is invisible until a transition that should have been rejected silently succeeds (or vice versa).

## Decision

Each state machine gets exactly one file (`reservation-transitions.ts`, `offer-transitions.ts`, `merchant-verification-transitions.ts`, `settlement-transitions.ts`, `complaint-transitions.ts`) declaring a single `Record<Status, readonly Status[]>` — every status mapped to the complete, explicit set of statuses it may move to. Nothing else about the transition lives anywhere else:

- `isXTransitionAllowed(from, to)` — a pure boolean check, used where the caller already has both the current and the target status in hand.
- `allowedFromStatusesFor(to)` — the **inverse** of the map, computed once from it (not hand-typed a second time): every status permitted to transition INTO `to`. This is exactly what a guarded `UPDATE ... WHERE status IN (...) ` clause needs, so every call site derives its WHERE list from this function instead of writing its own copy.

A guarded update then looks like `UPDATE ... SET status = 'REDEEMED' WHERE id = ? AND status IN (allowedFromStatusesFor('REDEEMED'))` (Prisma: `updateMany` with that same WHERE, checking `.count` to detect a no-op). The transition table is the **only** place that can drift; every consumer reads from it.

## Consequences

- **A new status, or a changed edge, is a one-file change** that automatically propagates to every enforcement point that derives its WHERE clause from `allowedFromStatusesFor` — there is no second list to remember to update.
- **This is also the concurrency-safety primitive**, not just a documentation aid: because every guarded write's WHERE clause is generated from the SAME source as its "is this legal" check, two racing writers (a webhook and a sweeper both trying to settle the same payment, a consumer and a merchant both trying to redeem the same reservation) resolve safely — the loser's `updateMany` matches zero rows instead of racing past a stale in-memory check.
- **A reviewer auditing "can X ever happen from Y" has exactly one file to read per entity**, not a call-site-by-call-site archaeology dig.
- **The convention is opt-in per file** — a future entity that skips it (hand-typing its own WHERE clauses again) reintroduces exactly the drift risk this exists to close. Complaints and settlement batches, both added since Task 5, follow it. **Content reports (`ReportStatus` — `moderation.service.ts`) do not**: there is no `report-transitions.ts`, and `action()`/`dismiss()` each hand-write their own guard (`where: { id: reportId, status: "OPEN" }`, and a bare `report.status !== "OPEN"` check) instead of deriving it from a map. `ReportStatus` only has three states (`OPEN`, `ACTIONED`, `DISMISSED`, both non-OPEN states terminal), so the drift risk this convention exists to close is low here in practice — but it is still a real, tracked deviation from the stated convention, not a followed one. A future change to this module should either bring it into line (a small, low-risk `report-transitions.ts` given how few states/edges exist) or this note should keep being corrected rather than silently re-claiming full coverage.
