import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { OpsAlertService } from "../notifications/email/ops-alert.service";

const BATCH_LIMIT = 500;
/** How long an invoice may sit DRAFT before it counts as stuck. The
 * outbox's own backoff ladder is exhausted long before this, so anything
 * still DRAFT after it needs a human, not more retries. */
const DRAFT_STUCK_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * [Fix round #6, I1] The alert half of "a failed commission e-invoice is
 * a permanent silent dead end".
 *
 * CommissionInvoiceService now rethrows a failed issuance so the outbox
 * retries it — but a retry ladder that runs out still ends in silence:
 * nothing in this codebase sweeps or alerts on outbox rows in status
 * DEAD, and a commission invoice has no admin surface at all. So a
 * Nilvera outage across a payout window would leave a day of invoices
 * DRAFT with a real tax obligation behind each one and no signal beyond a
 * log line nobody is watching.
 *
 * This sweep is that signal: once a day, every invoice still DRAFT hours
 * after it was drafted goes out as one OPS_ALERT_EMAIL digest.
 *
 * DELIBERATELY NO SENTINEL COLUMN, unlike the settlement reconciliation
 * alerts this round also fixed. The difference is whether the alerted
 * state can be cleared: a stale SENT batch could not (nothing writes
 * SETTLED), so re-alerting it daily was pure noise; a DRAFT invoice
 * clears itself the moment issuance succeeds, so a daily reminder is an
 * open, actionable work item rather than an unclosable alarm. Bounded
 * (BATCH_LIMIT) and oldest-first, matching the sibling sweeps.
 */
@Injectable()
export class CommissionInvoiceDraftAlertService {
  private readonly logger = new Logger(CommissionInvoiceDraftAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlert: OpsAlertService,
  ) {}

  @Cron("0 10 * * *", {
    name: "commission-invoice-draft-alert",
    timeZone: "Europe/Istanbul",
  })
  async runCron(): Promise<void> {
    try {
      await this.runOnce(new Date());
    } catch (err) {
      this.logger.error(
        `commission-invoice-draft-alert: tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /** Not private — specs call this directly with an injected `now`
   * instead of waiting on the cron schedule. */
  async runOnce(now: Date = new Date()): Promise<{ stuckDraftCount: number }> {
    const threshold = new Date(now.getTime() - DRAFT_STUCK_AFTER_MS);
    const stuck = await this.prisma.commissionInvoice.findMany({
      where: { status: "DRAFT", createdAt: { lte: threshold } },
      orderBy: { createdAt: "asc" },
      take: BATCH_LIMIT,
      select: {
        id: true,
        type: true,
        batchId: true,
        merchantId: true,
        totalAmountCents: true,
        createdAt: true,
      },
    });
    if (stuck.length === 0) return { stuckDraftCount: 0 };

    this.logger.error(
      `CRITICAL: ${stuck.length} commission invoice(s) are still DRAFT more than ${DRAFT_STUCK_AFTER_MS / 3_600_000}h after drafting — the e-document provider never accepted them: ${stuck
        .slice(0, 20)
        .map((i) => i.id)
        .join(", ")}`,
    );
    await this.opsAlert.trySend(
      "Komisyon faturaları kesilemedi (DRAFT)",
      `${stuck.length} komisyon faturası, oluşturulduktan ${DRAFT_STUCK_AFTER_MS / 3_600_000} saat sonra hâlâ e-belge sağlayıcısına iletilemedi:`,
      stuck.map(
        (i) =>
          `${i.id} — ${i.type} — hakediş ${i.batchId ?? "—"} — işletme ${i.merchantId} — ${i.totalAmountCents} kuruş — ${i.createdAt.toISOString()}`,
      ),
    );
    return { stuckDraftCount: stuck.length };
  }
}
