-- Task 7 fix round (Critical 1): a pod roll / crash mid-drain left rows
-- stranded in status='processing' FOREVER — claimBatch's WHERE only ever
-- matched status='queued', so nothing ever reclaimed a row a dead worker
-- had already claimed. Adding claimedAt lets the claim query also reclaim
-- any 'processing' row whose lease has expired (see
-- outbox-worker.service.ts's OUTBOX_LEASE_MS), and doubles as an
-- optimistic-concurrency token for the mark*() methods (a stale worker
-- that finishes late, after its row was already reclaimed by someone
-- else, has its markDone/markRetry/markDead's WHERE clause miss — the
-- claimedAt it's matching against is no longer current).

ALTER TABLE "outbox_events" ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE INDEX "outbox_events_status_claimedAt_idx" ON "outbox_events"("status", "claimedAt");
