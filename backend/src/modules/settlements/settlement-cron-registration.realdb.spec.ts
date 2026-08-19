import { Test } from "@nestjs/testing";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AppModule } from "../../app.module";

/**
 * [Fix round, C1; Fix round #2, C1-residual] Proves every intended
 * settlement/membership cron is actually REGISTERED with Nest's scheduler
 * at boot — by booting the REAL `AppModule`, not a hand-assembled stand-in.
 *
 * [Task 9] Extended (not duplicated into a second file) to also cover the
 * complaint SLA sweep and content-report takedown sweep — this file's own
 * name predates that scope, but it is the SAME standing gate the earlier
 * incident (a settlement cron shipped undecorated and passed 625 green
 * tests) established; a new SLA/takedown cron shipping unregistered
 * should fail here exactly the same way.
 *

 * [Fix round #2] The FIRST version of this spec constructed
 * SettlementBatchBuilderService/SettlementPayoutService/
 * MembershipRenewalCronService directly as bare providers with fake
 * constructor dependencies (a plain `Test.createTestingModule({providers:
 * [...]})`, no module imports at all). That proved the `@Cron` decorators
 * exist and that Nest's scheduler mechanism itself works — but it does NOT
 * prove `app.module.ts` actually wires the modules that own those
 * providers: dropping `SettlementsModule` (or `MembershipsModule`) from
 * `app.module.ts`'s `imports` array would leave that version of this test
 * green, since it never touched `AppModule` at all. This version boots
 * `AppModule` itself — the exact object `main.ts` bootstraps in
 * production — so a dropped module import fails this test the same way it
 * would fail a real deploy (the decorated provider is simply never
 * constructed, so its cron never registers).
 *
 * Booting the real `AppModule` requires a real, reachable database
 * (`PrismaService.onModuleInit` eagerly `$connect()`s — see its own doc
 * comment: "fails loudly at boot instead of on the first request", which
 * is exactly why a fake/absent DB can't be used here) — hence the
 * `.realdb.spec.ts` naming and the `TEST_DATABASE_URL` gate, same
 * discipline as every other real-DB spec in this codebase. Nothing is
 * written to the database — this only inspects `SchedulerRegistry` after
 * `app.init()` — but the connection itself must be genuine.
 *
 * [Fix round #3, MEDIUM] Booting the real AppModule starts EVERY
 * platform-wide cron for real — not just the four this spec cares about:
 * the outbox-drain worker (every 15s, dispatches settlement-sent-email +
 * commission-invoice handlers against whatever outbox rows currently
 * exist), the offers-publish scheduler (1m), the payments-sweeper and
 * pickup-reminder sweeps (5m). Under the documented local runner
 * (`npm test` = `--maxWorkers=2`), this app instance is alive
 * CONCURRENTLY with every other realdb spec file's own harness against
 * the SAME shared test database — exactly the class of cross-file
 * mutation this fix round's memberships-fixture-date fix (§12.4) closed
 * for the renewal-cron sweep specifically, at a much larger blast radius
 * here (four platform-wide sweeps, not one). This test's own purpose —
 * proving registration — does not need any of them to ever actually
 * FIRE, so every registered job is stopped immediately after `app.init()`
 * and before any assertion (or any await that could yield to a timer).
 * `SchedulerRegistry.getCronJobs()` still returns every job by name after
 * `.stop()` (stopping removes it from the underlying timer wheel, it does
 * NOT unregister it from the registry map) — so the gate's actual purpose
 * (proving the real app registers all four names) is fully intact.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("Settlement/membership cron registration — real AppModule boot", () => {
  it("registers settlement-nightly-batch, settlement-payout-execute, settlement-reconciliation, membership-renewal, complaint-sla-sweep, moderation-takedown-sweep, commission-invoice-draft-alert, and reservation-no-show-sweep", async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    try {
      const registry = app.get(SchedulerRegistry);

      // [Fix round #3, MEDIUM] Stop every registered cron job (not just
      // the four under test — this app boots the WHOLE module graph, so
      // outbox-drain/offers-publish-scheduler/payments-sweeper/pickup-
      // reminder all registered too) BEFORE reading anything or awaiting
      // again, so none of them can ever fire against the shared test DB
      // for the remainder of this test's lifetime.
      for (const job of registry.getCronJobs().values()) {
        job.stop();
      }

      const names = new Set(registry.getCronJobs().keys());

      expect(names.has("settlement-nightly-batch")).toBe(true);
      expect(names.has("settlement-payout-execute")).toBe(true);
      expect(names.has("settlement-reconciliation")).toBe(true);
      expect(names.has("membership-renewal")).toBe(true);
      // [Task 9] The complaint SLA sweep (complaints/complaint-sla-cron.
      // service.ts) and content-report takedown sweep
      // (moderation/moderation-takedown-cron.service.ts) — added to this
      // SAME standing gate per the dispatch note ("ADD your SLA/takedown
      // crons to that gate"), rather than a second, easy-to-forget-to-run
      // registration spec.
      expect(names.has("complaint-sla-sweep")).toBe(true);
      expect(names.has("moderation-takedown-sweep")).toBe(true);
      // [Fix round #6, I1] The commission-invoice DRAFT sweep — the alert
      // half of "a failed e-fatura is a permanent silent dead end". Same
      // standing gate: a sweep that ships unregistered fails here rather
      // than quietly never running.
      expect(names.has("commission-invoice-draft-alert")).toBe(true);
      // [No-show] The sweep that closes the pickup window on a bag nobody
      // collected (reservations/no-show-sweeper.service.ts). It belongs on
      // this SAME standing gate for a money reason, not a tidiness one: a
      // reservation that never reaches NO_SHOW is never picked up by the
      // settlement eligibility scan either, so a sweep shipped
      // unregistered means merchants silently stop being paid for
      // no-shows — the exact hole the sweeper exists to close.
      expect(names.has("reservation-no-show-sweep")).toBe(true);

      // [Fix round #6, M7] Every DAILY job must be pinned to
      // Europe/Istanbul. The container runs UTC (no TZ in the Dockerfile
      // or any compose file), so an unpinned "0 3 * * *" fires at 06:00
      // Istanbul while docs/operations.md's cron table presents all of
      // these on one clock. Only the daily ones are checked: the payout
      // executor (*/5) and the hourly sweeps have no wall-clock meaning.
      for (const name of [
        "settlement-nightly-batch",
        "membership-renewal",
        "settlement-reconciliation",
        "commission-invoice-draft-alert",
      ]) {
        const job = registry.getCronJobs().get(name)!;
        const timeZone = (job.cronTime as { timeZone?: string }).timeZone;
        expect({ name, timeZone }).toEqual({
          name,
          timeZone: "Europe/Istanbul",
        });
      }
    } finally {
      await app.close();
    }
  }, 30000);
});
