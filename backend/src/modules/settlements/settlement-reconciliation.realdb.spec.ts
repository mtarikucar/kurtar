import { PrismaClient } from "@prisma/client";
import { PublicHolidayService } from "./public-holiday.service";
import { SettlementPayoutService } from "./settlement-payout.service";

/**
 * [Fix round #6, I3/I4/M3] Real-DB proof of the daily reconciliation
 * sweep's three branches and — the part that actually mattered — their
 * alert-once discipline.
 *
 * Before this round the sweep re-emitted one CRITICAL log line per
 * matching batch on EVERY tick, unbounded and unordered, for a stale-SENT
 * condition nothing in the codebase can clear (no writer ever sets
 * SETTLED). The regulated 5-business-day payout deadline shared that
 * method, that level and that noise, had no pre-breach warning at all,
 * and never reached an operator through any channel but the log.
 *
 * The queries are raw `UPDATE ... RETURNING` (sentinel-claiming has to be
 * atomic), so mocks would prove nothing here — this runs against real
 * Postgres.
 *
 * Every assertion is scoped to THIS file's own seeded batch ids. The
 * sweep itself is platform-wide by design, so a count-based assertion
 * would be a table-wide aggregate against a database shared with
 * concurrently-running spec files.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "settlement-reconciliation-realdb";

interface SentDigest {
  subject: string;
  items: string[];
}

d(
  "Settlement reconciliation sweep — alert once, bounded, with a pre-breach warning",
  () => {
    let prisma: PrismaClient;
    let merchantId: string;
    const digests: SentDigest[] = [];
    let payout: SettlementPayoutService;

    // 2026-08-18 is a Tuesday; one business day out is Wednesday the 19th
    // (no Turkish public holiday in that window — 30 Ağustos is the next).
    const NOW = new Date("2026-08-18T09:00:00.000Z");

    const ids: Record<"staleSent" | "dueSoon" | "overdue" | "control", string> =
      {
        staleSent: "",
        dueSoon: "",
        overdue: "",
        control: "",
      };

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      const opsAlert = {
        trySend: async (subject: string, _intro: string, items: string[]) => {
          digests.push({ subject, items });
          return true;
        },
      };
      payout = new SettlementPayoutService(
        prisma as never,
        { payout: async () => ({ pspTransferRef: "unused" }) } as never,
        { publish: async () => undefined } as never,
        new PublicHolidayService(prisma as never),
        opsAlert as never,
      );

      const merchant = await prisma.merchant.create({
        data: {
          legalName: "Realdb Reconciliation Test A.S.",
          tradeName: "Realdb Reconciliation",
          taxId: `${TAG}-${Date.now()}`,
          iban: "TR000006701000000000000002",
          verificationStatus: "APPROVED",
        },
      });
      merchantId = merchant.id;

      const seedBatch = async (
        day: string,
        data: Record<string, unknown>,
      ): Promise<string> => {
        const periodStart = new Date(`${day}T00:00:00.000Z`);
        const row = await prisma.settlementBatch.create({
          data: {
            merchantId,
            periodStart,
            periodEnd: new Date(periodStart.getTime() + 24 * 60 * 60 * 1000),
            netPayoutCents: 12345,
            ...data,
          } as never,
        });
        return row.id;
      };

      ids.staleSent = await seedBatch("2026-08-05", {
        status: "SENT",
        sentAt: new Date("2026-08-10T00:00:00.000Z"),
        pspTransferRef: `${TAG}-ref`,
      });
      ids.dueSoon = await seedBatch("2026-08-12", {
        status: "CALCULATED",
        dueAt: new Date("2026-08-19T00:00:00.000Z"),
      });
      ids.overdue = await seedBatch("2026-08-10", {
        status: "APPROVED",
        dueAt: new Date("2026-08-17T00:00:00.000Z"),
      });
      ids.control = await seedBatch("2026-08-17", {
        status: "CALCULATED",
        dueAt: new Date("2026-08-25T00:00:00.000Z"),
      });
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.settlementBatch.deleteMany({ where: { merchantId } });
      await prisma.merchant.delete({ where: { id: merchantId } });
      await prisma.$disconnect();
    });

    const mine = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(ids).map(async ([key, id]) => [
            key,
            await prisma.settlementBatch.findUniqueOrThrow({ where: { id } }),
          ]),
        ),
      );

    it("alerts each condition exactly once, warns BEFORE the payout deadline, and leaves an untouched batch alone", async () => {
      const first = await payout.reconcileStuckBatches(NOW);
      expect(first.staleSentCount).toBeGreaterThanOrEqual(1);
      expect(first.dueSoonCount).toBeGreaterThanOrEqual(1);
      expect(first.overdueUnsentCount).toBeGreaterThanOrEqual(1);

      const after = await mine();
      expect(after.staleSent.reconciliationAlertSentAt).toEqual(NOW);
      // [I4] The branch that did not exist at all before this round: a
      // warning one business day BEFORE the regulated deadline, rather than
      // only a breach notice after it.
      expect(after.dueSoon.payoutDueWarningSentAt).toEqual(NOW);
      expect(after.overdue.payoutOverdueAlertSentAt).toEqual(NOW);
      // A batch comfortably inside its window is touched by nothing.
      expect(after.control.payoutDueWarningSentAt).toBeNull();
      expect(after.control.payoutOverdueAlertSentAt).toBeNull();
      expect(after.control.reconciliationAlertSentAt).toBeNull();

      // Each condition reached a human, not just the log.
      const firstRunItems = digests.flatMap((dg) => dg.items).join("\n");
      expect(firstRunItems).toContain(ids.staleSent);
      expect(firstRunItems).toContain(ids.dueSoon);
      expect(firstRunItems).toContain(ids.overdue);
      expect(firstRunItems).not.toContain(ids.control);

      // THE POINT: tomorrow's tick does NOT re-alert any of them. Branch
      // (a) is the one that made this critical — nothing can move a batch
      // out of SENT, so without the sentinel the same CRITICAL lines fired
      // for the same batches every day forever, and buried the payout-SLA
      // branch sitting in the same method at the same level.
      digests.length = 0;
      const secondNow = new Date("2026-08-19T09:00:00.000Z");
      await payout.reconcileStuckBatches(secondNow);

      const afterSecond = await mine();
      expect(afterSecond.staleSent.reconciliationAlertSentAt).toEqual(NOW);
      expect(afterSecond.dueSoon.payoutDueWarningSentAt).toEqual(NOW);
      expect(afterSecond.overdue.payoutOverdueAlertSentAt).toEqual(NOW);
      const secondRunItems = digests.flatMap((dg) => dg.items).join("\n");
      expect(secondRunItems).not.toContain(ids.staleSent);
      expect(secondRunItems).not.toContain(ids.overdue);

      // ...but a batch that CROSSES its deadline between ticks still gets
      // the breach alert, even though it was already warned: the warning
      // and the breach are separate sentinels, not one "already told you".
      expect(afterSecond.dueSoon.payoutOverdueAlertSentAt).toEqual(secondNow);
      expect(secondRunItems).toContain(ids.dueSoon);
    }, 30000);
  },
);
