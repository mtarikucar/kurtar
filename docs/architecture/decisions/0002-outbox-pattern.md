# 2. The outbox pattern + at-least-once delivery

## Status

Accepted (Task 7, `modules/outbox`).

## Context

Publishing an offer needs to fan out a nearby-radius push notification to every consumer who might care. Redeeming a reservation needs to eventually queue a rating invite two hours later. A merchant's verification status changing needs to send an email. None of these side effects can safely happen **inside** the same database transaction that made the state change (a slow SMTP call or a Redis outage would then be able to fail — or worse, roll back — a reservation write), and none of them can safely happen as a bare `fire-and-forget` call **after** the transaction commits either: if the process crashes between the commit and the notification call, the notification is silently lost with no record it was ever supposed to happen.

## Decision

Every side effect that isn't itself a direct database write goes through `OutboxEvent`: a row (`type`, `payload`, `status: queued|processing|done|dead`, `attempts`, `nextAttemptAt`, `claimedAt`) written in the **same transaction** as the state change it describes. A separate worker (`outbox-worker.service.ts`, a 15-second cron) claims a bounded batch of due rows, dispatches each to its registered handler, and marks the result.

Delivery is **at-least-once, never at-most-once**:

- A row is only removed from "eligible to claim" by successfully marking it `done` — a crash mid-dispatch leaves it `processing`, and a 5-minute per-event lease (`OUTBOX_LEASE_MS`, re-stamped immediately before each event's own dispatch — not once per batch, so a slow sibling can't fool the lease) lets a *different* worker reclaim and re-dispatch it once the lease expires.
- This means every handler **must be idempotent** — a push notification, an email, or a rating-invite queue-write can be delivered/attempted twice under a crash-at-the-wrong-moment scenario, and every handler in this codebase is written with that assumption (e.g. sentinel columns like `pickupReminderSentAt`/`shortfallResolvedAt` that a re-run checks before acting again).
- A producer that needs a genuine "never insert this twice" guarantee supplies `idempotencyKey` (nullable, `@unique` — Postgres treats every `NULL` as distinct, so keyless producers coexist freely with keyed ones); a collision propagates a real P2002 out of the producer's own transaction rather than being silently swallowed.

## Consequences

- **No notification is ever silently dropped by a process crash.** The worst case is a duplicate attempt, not a lost one — and duplicates are handled by idempotent handlers, not prevented by hoping the crash never happens.
- **Every handler carries real idempotency logic**, which is more code than a naive `await sendEmail(...)` call — this is the deliberate cost of the guarantee above, not an oversight.
- **The whole pipeline runs in-process** (NestJS's `@nestjs/schedule`, no separate message broker) — correct at kurtar's current single-`api`-replica scale. If the `api` service is ever scaled to multiple replicas, the claim query (`status='queued' AND nextAttemptAt<=now()`, ordered by id, `SELECT ... FOR UPDATE SKIP LOCKED`-style claiming) needs re-verification under real concurrent claimers — it was designed with that in mind but has only ever run as one instance.
- **A worker crash doesn't lose data, but it does delay it** up to the lease window — an operator watching `docs/operations.md`'s cron inventory knows a stalled outbox drain means notifications are late, not gone.
