import { Test } from "@nestjs/testing";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AppModule } from "../../app.module";

/**
 * [Fix round, C1; Fix round #2, C1-residual] Proves every intended
 * settlement/membership cron is actually REGISTERED with Nest's scheduler
 * at boot — by booting the REAL `AppModule`, not a hand-assembled stand-in.
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
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("Settlement/membership cron registration — real AppModule boot", () => {
  it("registers settlement-nightly-batch, settlement-payout-execute, settlement-reconciliation, and membership-renewal", async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    try {
      const registry = app.get(SchedulerRegistry);
      const names = new Set(registry.getCronJobs().keys());

      expect(names.has("settlement-nightly-batch")).toBe(true);
      expect(names.has("settlement-payout-execute")).toBe(true);
      expect(names.has("settlement-reconciliation")).toBe(true);
      expect(names.has("membership-renewal")).toBe(true);
    } finally {
      await app.close();
    }
  }, 30000);
});
