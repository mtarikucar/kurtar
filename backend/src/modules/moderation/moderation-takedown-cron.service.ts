import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../notifications/email/email.service";
import { TAKEDOWN_WARNING_WINDOW_MS } from "./takedown-date-math";

const BATCH_LIMIT = 500;

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  takedownDeadlineAt: Date;
}

/**
 * Content-report takedown SLA sweep (brief §5): "approaching/breached 48h
 * ⇒ alert (same discipline as complaints)." Unlike complaints, ReportStatus
 * has no ESCALATED value — breach here is alert-ONLY, never an automatic
 * status change (an admin still has to actually action/dismiss it), so
 * BOTH branches need their own idempotency sentinel
 * (takedownWarningSentAt / takedownBreachedSentAt) rather than relying on
 * a status transition to make a re-run a no-op. Same atomic
 * UPDATE...RETURNING race-safety shape as
 * complaints/complaint-sla-cron.service.ts.
 *
 * ADDED TO THE STANDING CRON-REGISTRATION GATE — see
 * settlements/settlement-cron-registration.realdb.spec.ts, which now also
 * asserts "moderation-takedown-sweep" is registered on a real AppModule
 * boot.
 */
@Injectable()
export class ModerationTakedownCronService {
  private readonly logger = new Logger(ModerationTakedownCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, { name: "moderation-takedown-sweep" })
  async runCron(): Promise<void> {
    // [Fix round, Important 8] See complaint-sla-cron.service.ts's
    // identical guard for the full reasoning — a failed tick must log
    // loud and let the next 30-minute tick retry, never vanish silently.
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(
        `moderation-takedown-sweep: tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async runOnce(
    now: Date = new Date(),
  ): Promise<{ warnedCount: number; breachedCount: number }> {
    const warned = await this.warnApproaching(
      now,
      new Date(now.getTime() + TAKEDOWN_WARNING_WINDOW_MS),
    );
    const breached = await this.warnBreached(now);

    // [Fix round, Important 8] Each branch's error log is unconditional
    // and each branch's digest is wrapped independently — see
    // complaint-sla-cron.service.ts's identical fix for why a throw from
    // EmailService.sendEmail (not just a false return) in the WARNED
    // branch must never suppress the BREACHED branch's own error log.
    if (warned.length > 0) {
      this.logger.error(
        `moderation-takedown-sweep: ${warned.length} report(s) within ${TAKEDOWN_WARNING_WINDOW_MS / 3_600_000}h of their 48h takedown deadline: ${warned.map((w) => w.id).join(", ")}`,
      );
      await this.trySendDigest(
        "İçerik raporu SLA süresi yaklaşıyor",
        `${warned.length} rapor, 48 saatlik değerlendirme süresinin son ${TAKEDOWN_WARNING_WINDOW_MS / 3_600_000} saatine girdi:`,
        warned.map(
          (w) =>
            `#${w.id} — ${w.targetType}/${w.targetId} — bitiş: ${w.takedownDeadlineAt.toISOString()}`,
        ),
      );
    }
    if (breached.length > 0) {
      this.logger.error(
        `moderation-takedown-sweep: ${breached.length} report(s) BREACHED their 48h takedown deadline (still OPEN — no automatic action taken): ${breached.map((b) => b.id).join(", ")}`,
      );
      await this.trySendDigest(
        "İçerik raporu SLA süresi doldu",
        `${breached.length} rapor, 48 saatlik değerlendirme süresini aştı ve hâlâ işlem bekliyor:`,
        breached.map((b) => `#${b.id} — ${b.targetType}/${b.targetId}`),
      );
    }

    return { warnedCount: warned.length, breachedCount: breached.length };
  }

  /** Approaching-deadline alert — same atomic UPDATE...RETURNING
   * race-safety shape as complaint-sla-cron.service.ts's warnApproaching. */
  private async warnApproaching(
    now: Date,
    threshold: Date,
  ): Promise<ReportRow[]> {
    return this.prisma.$queryRaw<ReportRow[]>`
      UPDATE "content_reports"
      SET "takedownWarningSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "content_reports"
        WHERE "status" = 'OPEN'
          AND "takedownWarningSentAt" IS NULL
          AND "takedownDeadlineAt" <= ${threshold}
          AND "takedownDeadlineAt" > ${now}
        ORDER BY "takedownDeadlineAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "targetType", "targetId", "takedownDeadlineAt"
    `;
  }

  /** Breach alert — no status change (ReportStatus has no ESCALATED
   * value), just its own idempotency sentinel. */
  private async warnBreached(now: Date): Promise<ReportRow[]> {
    return this.prisma.$queryRaw<ReportRow[]>`
      UPDATE "content_reports"
      SET "takedownBreachedSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "content_reports"
        WHERE "status" = 'OPEN'
          AND "takedownBreachedSentAt" IS NULL
          AND "takedownDeadlineAt" <= ${now}
        ORDER BY "takedownDeadlineAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "targetType", "targetId", "takedownDeadlineAt"
    `;
  }

  /** [Fix round, Important 8] Never throws — see complaint-sla-cron.
   * service.ts's identical helper for the full reasoning. */
  private async trySendDigest(
    subject: string,
    intro: string,
    items: string[],
  ): Promise<void> {
    try {
      await this.sendDigest(subject, intro, items);
    } catch (err) {
      this.logger.error(
        `moderation-takedown-sweep: digest email threw for "${subject}": ${(err as Error).message}`,
      );
    }
  }

  private async sendDigest(
    subject: string,
    intro: string,
    items: string[],
  ): Promise<void> {
    const opsEmail = this.config.get<string>("OPS_ALERT_EMAIL");
    if (!opsEmail) {
      this.logger.warn(
        `moderation-takedown-sweep: OPS_ALERT_EMAIL is not configured — skipping the digest email (the error log above is the standing record).`,
      );
      return;
    }
    const sent = await this.email.sendEmail({
      to: opsEmail,
      subject,
      template: "ops-sla-alert",
      context: { title: subject, intro, items },
    });
    if (!sent) {
      this.logger.error(
        `moderation-takedown-sweep: failed to send the ops digest email (subject: ${subject}).`,
      );
    }
  }
}
