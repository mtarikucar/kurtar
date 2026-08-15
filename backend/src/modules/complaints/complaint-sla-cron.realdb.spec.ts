import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { EmailService } from "../notifications/email/email.service";
import { ComplaintSlaCronService } from "./complaint-sla-cron.service";
import { COMPLAINT_SLA_WARNING_WINDOW_MS } from "./sla-date-math";

/**
 * Real-DB proof of brief §8's mandatory scenario (e): the complaint SLA
 * cron escalates ONLY breached rows and is idempotent across two runs —
 * a second `runOnce()` call over the SAME fixture must never re-touch
 * this test's own already-ESCALATED/already-warned rows (the guarded
 * UPDATE...RETURNING's WHERE no longer matches them). Every assertion is
 * scoped to this file's own seeded row ids, never the cron's own
 * table-wide returned counts (used only as a loose `>=` sanity check) —
 * see the inline comment at the first assertion for why.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const TAG = "complaint-sla-cron-realdb-test";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[complaint-sla-cron.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

function buildCron(prisma: PrismaClient) {
  const config = { get: () => undefined } as unknown as ConfigService;
  const email = new EmailService(config); // no SMTP configured -> log-only mock, sendEmail always resolves true
  return new ComplaintSlaCronService(prisma as any, email, config);
}

d(
  "ComplaintSlaCronService — real DB idempotency + breach-only escalation",
  () => {
    let prisma: PrismaClient;
    let userId: string;
    const complaintIds: string[] = [];

    beforeAll(async () => {
      prisma = new PrismaClient();
      const user = await prisma.user.create({
        data: { phoneE164: `+9055516${Date.now().toString().slice(-5)}` },
      });
      userId = user.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      await safeCleanup("auditLog", () =>
        prisma.auditLog.deleteMany({
          where: { entity: "ComplaintTicket", entityId: { in: complaintIds } },
        }),
      );
      await safeCleanup("complaints", () =>
        prisma.complaintTicket.deleteMany({
          where: { id: { in: complaintIds } },
        }),
      );
      await safeCleanup("user", () =>
        prisma.user.delete({ where: { id: userId } }),
      );
      await prisma.$disconnect();
    });

    it("[e] escalates ONLY breached OPEN/MERCHANT_RESPONDED rows, warns ONLY approaching ones, and a second run changes nothing further", async () => {
      const now = new Date();

      const breached = await prisma.complaintTicket.create({
        data: {
          userId,
          category: "OTHER",
          description: `${TAG} breached`,
          status: "OPEN",
          slaDeadlineAt: new Date(now.getTime() - 60 * 60 * 1000), // 1h ago
        },
      });
      const breachedMerchantResponded = await prisma.complaintTicket.create({
        data: {
          userId,
          category: "OTHER",
          description: `${TAG} breached, merchant responded`,
          status: "MERCHANT_RESPONDED",
          slaDeadlineAt: new Date(now.getTime() - 30 * 60 * 1000),
        },
      });
      const approaching = await prisma.complaintTicket.create({
        data: {
          userId,
          category: "OTHER",
          description: `${TAG} approaching`,
          status: "OPEN",
          slaDeadlineAt: new Date(
            now.getTime() + COMPLAINT_SLA_WARNING_WINDOW_MS / 2,
          ), // inside the 48h window
        },
      });
      const safelyFar = await prisma.complaintTicket.create({
        data: {
          userId,
          category: "OTHER",
          description: `${TAG} safely far`,
          status: "OPEN",
          slaDeadlineAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days out
        },
      });
      const alreadyResolved = await prisma.complaintTicket.create({
        data: {
          userId,
          category: "OTHER",
          description: `${TAG} already resolved, deadline in the past`,
          status: "RESOLVED",
          slaDeadlineAt: new Date(now.getTime() - 60 * 60 * 1000),
          resolvedAt: now,
        },
      });
      complaintIds.push(
        breached.id,
        breachedMerchantResponded.id,
        approaching.id,
        safelyFar.id,
        alreadyResolved.id,
      );

      const cron = buildCron(prisma);

      // [I8 discipline] cron.runOnce's own returned counts are a
      // TABLE-WIDE sweep result, not scoped to this test's fixture — a
      // shared dev database running other realdb specs could inflate
      // (or, under --maxWorkers, race) an exact-equality assertion on
      // them. Only used here as a loose "did something happen at all"
      // sanity check (>=, never ===); the REAL proof is every assertion
      // below, which re-reads this test's own seeded rows by id.
      const firstRun = await cron.runOnce(now);
      expect(firstRun.escalatedCount).toBeGreaterThanOrEqual(2);
      expect(firstRun.warnedCount).toBeGreaterThanOrEqual(1);

      const [
        rowBreached,
        rowBreachedMR,
        rowApproaching,
        rowSafelyFar,
        rowResolved,
      ] = await Promise.all([
        prisma.complaintTicket.findUniqueOrThrow({
          where: { id: breached.id },
        }),
        prisma.complaintTicket.findUniqueOrThrow({
          where: { id: breachedMerchantResponded.id },
        }),
        prisma.complaintTicket.findUniqueOrThrow({
          where: { id: approaching.id },
        }),
        prisma.complaintTicket.findUniqueOrThrow({
          where: { id: safelyFar.id },
        }),
        prisma.complaintTicket.findUniqueOrThrow({
          where: { id: alreadyResolved.id },
        }),
      ]);
      expect(rowBreached.status).toBe("ESCALATED");
      expect(rowBreachedMR.status).toBe("ESCALATED");
      expect(rowApproaching.status).toBe("OPEN");
      expect(rowApproaching.slaWarningSentAt).not.toBeNull();
      expect(rowSafelyFar.status).toBe("OPEN");
      expect(rowSafelyFar.slaWarningSentAt).toBeNull();
      // A RESOLVED complaint past its deadline is never touched — it's not
      // "open", so the SLA machinery has nothing left to enforce.
      expect(rowResolved.status).toBe("RESOLVED");

      const escalationAudits = await prisma.auditLog.findMany({
        where: {
          entity: "ComplaintTicket",
          entityId: { in: [breached.id, breachedMerchantResponded.id] },
          action: "complaint.sla_breach_escalate",
        },
      });
      expect(escalationAudits).toHaveLength(2);

      // Idempotency: a second run over the identical `now` must not touch
      // THIS test's own rows again — the already-ESCALATED/already-warned
      // rows no longer match either guarded UPDATE's WHERE. Deliberately
      // NOT asserting the cron's own returned counts are exactly 0 (same
      // table-wide-aggregate fragility as above); instead, re-read this
      // test's own rows and confirm nothing about them changed a second
      // time.
      await cron.runOnce(now);

      const [rowBreachedAfter2, rowBreachedMRAfter2, rowApproachingAfter2] =
        await Promise.all([
          prisma.complaintTicket.findUniqueOrThrow({
            where: { id: breached.id },
          }),
          prisma.complaintTicket.findUniqueOrThrow({
            where: { id: breachedMerchantResponded.id },
          }),
          prisma.complaintTicket.findUniqueOrThrow({
            where: { id: approaching.id },
          }),
        ]);
      expect(rowBreachedAfter2.status).toBe("ESCALATED");
      expect(rowBreachedMRAfter2.status).toBe("ESCALATED");
      // slaWarningSentAt is unchanged by the second run (still the exact
      // timestamp the first run stamped, not overwritten).
      expect(rowApproachingAfter2.slaWarningSentAt).toEqual(
        rowApproaching.slaWarningSentAt,
      );

      const escalationAuditsAfterSecondRun = await prisma.auditLog.findMany({
        where: {
          entity: "ComplaintTicket",
          entityId: { in: [breached.id, breachedMerchantResponded.id] },
          action: "complaint.sla_breach_escalate",
        },
      });
      // Still exactly 2 (scoped to THIS test's two entityIds) — the
      // second run did not write a duplicate audit row for either.
      expect(escalationAuditsAfterSecondRun).toHaveLength(2);
    }, 20_000);
  },
);
