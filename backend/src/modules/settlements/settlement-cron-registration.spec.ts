import { Test } from "@nestjs/testing";
import { ScheduleModule, SchedulerRegistry } from "@nestjs/schedule";
import { SettlementBatchBuilderService } from "./settlement-batch-builder.service";
import { SettlementPayoutService } from "./settlement-payout.service";
import { MembershipRenewalCronService } from "../memberships/membership-renewal-cron.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PublicHolidayService } from "./public-holiday.service";
import { PricingService } from "./pricing.service";
import { MembershipOffsetService } from "../memberships/membership-offset.service";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { OutboxService } from "../outbox/outbox.service";

/**
 * [Fix round, C1] Proves every intended settlement/membership cron is
 * actually REGISTERED with Nest's scheduler at boot — this is the class of
 * bug the review round caught (`runNightlyCycle` was fully implemented,
 * fully callable, fully tested via realdb specs... and had no `@Cron`
 * decorator at all, so it would never have run on its own in a deployed
 * process, and 625 green tests never noticed because every existing test
 * called the method directly). A method being callable and covered by
 * tests proves nothing about whether the SCHEDULER will ever call it —
 * only inspecting `SchedulerRegistry.getCronJobs()` after a real Nest
 * bootstrap does that, which is why this is a `Test.createTestingModule`
 * boot rather than a plain unit test of the service class.
 *
 * Every constructor dependency is a bare stand-in (never actually invoked
 * — nothing in this spec calls the decorated methods, it only inspects
 * registration), so this needs no database and stays in the fast/unit
 * tier rather than requiring TEST_DATABASE_URL.
 */
describe("Settlement/membership cron registration", () => {
  it("registers settlement-nightly-batch, settlement-payout-execute, settlement-reconciliation, and membership-renewal", async () => {
    const fakePrisma = {} as PrismaService;
    const module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        SettlementBatchBuilderService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: PublicHolidayService, useValue: {} },
        { provide: PricingService, useValue: {} },
        { provide: MembershipOffsetService, useValue: {} },
        SettlementPayoutService,
        { provide: PaymentsFacadeService, useValue: {} },
        { provide: OutboxService, useValue: {} },
        MembershipRenewalCronService,
      ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    try {
      const registry = app.get(SchedulerRegistry);
      const jobNames = registry.getCronJobs().keys();
      const names = new Set(jobNames);

      expect(names.has("settlement-nightly-batch")).toBe(true);
      expect(names.has("settlement-payout-execute")).toBe(true);
      expect(names.has("settlement-reconciliation")).toBe(true);
      expect(names.has("membership-renewal")).toBe(true);
    } finally {
      await app.close();
    }
  });
});
