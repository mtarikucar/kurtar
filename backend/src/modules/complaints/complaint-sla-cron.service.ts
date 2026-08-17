import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../notifications/email/email.service";
import { COMPLAINT_SLA_WARNING_WINDOW_MS } from "./sla-date-math";

const BATCH_LIMIT = 500;

interface WarnedRow {
  id: string;
  category: string;
  slaDeadlineAt: Date;
}

interface EscalatedRow {
  id: string;
}

/**
 * ETAHS SLA sweep (brief §4): "complaints within 48h of deadline ⇒ admin
 * email + error log; breached ⇒ ESCALATED + error log. Never silently
 * pass a deadline." Two independent, idempotent branches, each a single
 * atomic `UPDATE ... RETURNING` (not a separate findMany-then-updateMany
 * pair — see the doc comment on each method for why that matters under
 * concurrency): the guarded WHERE means two ticks (or two concurrently
 * running instances) never double-alert or double-escalate the same row.
 * Bounded (BATCH_LIMIT), oldest-deadline-first, so a large backlog is
 * worked down over several ticks instead of risking an unbounded sweep.
 *
 * ADDED TO THE STANDING CRON-REGISTRATION GATE — see
 * settlements/settlement-cron-registration.realdb.spec.ts, which now also
 * asserts "complaint-sla-sweep" is registered on a real AppModule boot.
 */
@Injectable()
export class ComplaintSlaCronService {
  private readonly logger = new Logger(ComplaintSlaCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: "complaint-sla-sweep" })
  async runCron(): Promise<void> {
    // [Fix round, Important 8] The cron entry point itself must never let
    // an uncaught rejection vanish into whatever @nestjs/schedule does
    // internally with a failed tick — log loud, let the NEXT hourly tick
    // retry (every guarded UPDATE below is naturally idempotent, so a
    // partially-failed run costs nothing to simply re-attempt).
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(
        `complaint-sla-sweep: tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async runOnce(
    now: Date = new Date(),
  ): Promise<{ warnedCount: number; escalatedCount: number }> {
    const warned = await this.warnApproaching(now);
    const escalated = await this.escalateBreached(now);

    // [Fix round, Important 8] Each branch's error-log line runs
    // UNCONDITIONALLY, and each branch's digest email is wrapped
    // INDEPENDENTLY (trySendDigest never throws) — EmailService.sendEmail
    // THROWS (not returns false) on a template-compile failure, and
    // before this fix that throw inside the WARN branch's digest call
    // aborted the whole method, skipping the BREACH branch entirely: its
    // error log (the actual "never silently pass a deadline" record) and
    // its own digest attempt never ran, even though the escalation
    // itself had already committed to the database. Mirrors
    // settlement-batch-builder.service.ts's "log rather than propagate"
    // discipline for a per-item failure that must not take down the rest
    // of the sweep.
    if (warned.length > 0) {
      this.logger.error(
        `complaint-sla-sweep: ${warned.length} complaint(s) within ${COMPLAINT_SLA_WARNING_WINDOW_MS / 3_600_000}h of their ETAHS deadline: ${warned.map((w) => w.id).join(", ")}`,
      );
      await this.trySendDigest(
        "Şikayet SLA süresi yaklaşıyor",
        `${warned.length} şikayet, ETAHS 15 günlük yanıt süresinin son ${COMPLAINT_SLA_WARNING_WINDOW_MS / 3_600_000} saatine girdi:`,
        warned.map(
          (w) =>
            `#${w.id} — ${w.category} — bitiş: ${w.slaDeadlineAt.toISOString()}`,
        ),
      );
    }
    if (escalated.length > 0) {
      this.logger.error(
        `complaint-sla-sweep: ${escalated.length} complaint(s) BREACHED their ETAHS deadline and were auto-escalated: ${escalated.map((e) => e.id).join(", ")}`,
      );
      await this.trySendDigest(
        "Şikayet SLA süresi doldu — ESCALATED",
        `${escalated.length} şikayet, ETAHS 15 günlük yanıt süresini aştığı için otomatik olarak yükseltildi:`,
        escalated.map((e) => `#${e.id}`),
      );
    }

    return { warnedCount: warned.length, escalatedCount: escalated.length };
  }

  /**
   * Approaching-deadline alert. A single `UPDATE ... RETURNING` (not a
   * findMany-then-updateMany pair) is what makes this race-safe: the
   * WHERE clause (status open, not yet warned, within the window) is
   * checked and the sentinel stamped atomically, so two concurrent runs
   * can never both pick up and alert on the same row — the loser's
   * UPDATE simply matches nothing once the winner has already stamped
   * slaWarningSentAt.
   */
  private async warnApproaching(now: Date): Promise<WarnedRow[]> {
    const threshold = new Date(now.getTime() + COMPLAINT_SLA_WARNING_WINDOW_MS);
    return this.prisma.$queryRaw<WarnedRow[]>`
      UPDATE "complaint_tickets"
      SET "slaWarningSentAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "complaint_tickets"
        WHERE "status" IN ('OPEN', 'MERCHANT_RESPONDED')
          AND "slaWarningSentAt" IS NULL
          AND "slaDeadlineAt" <= ${threshold}
          AND "slaDeadlineAt" > ${now}
        ORDER BY "slaDeadlineAt" ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING "id", "category", "slaDeadlineAt"
    `;
  }

  /** Breach -> ESCALATED. Same atomic-UPDATE-RETURNING shape as above —
   * idempotent across any number of ticks, since a row that is already
   * ESCALATED never matches the WHERE again.
   *
   * [Fix round, Minor] The escalation UPDATE and its AuditLog rows now
   * commit or roll back together, inside one `$transaction` — previously
   * these were two separate top-level statements, so a crash strictly
   * between them left a complaint permanently ESCALATED with NO audit
   * trail (the guarded WHERE never re-matches an already-ESCALATED row,
   * so no later retry could ever backfill the missing AuditLog rows). */
  private async escalateBreached(now: Date): Promise<EscalatedRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const escalated = await tx.$queryRaw<EscalatedRow[]>`
        UPDATE "complaint_tickets"
        SET "status" = 'ESCALATED', "updatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "complaint_tickets"
          WHERE "status" IN ('OPEN', 'MERCHANT_RESPONDED')
            AND "slaDeadlineAt" <= ${now}
          ORDER BY "slaDeadlineAt" ASC
          LIMIT ${BATCH_LIMIT}
        )
        RETURNING "id"
      `;
      if (escalated.length > 0) {
        await tx.auditLog.createMany({
          data: escalated.map((row) => ({
            actorType: "SYSTEM",
            actorId: null,
            action: "complaint.sla_breach_escalate",
            entity: "ComplaintTicket",
            entityId: row.id,
            diffJson: { slaBreachedAt: now.toISOString() },
          })),
        });
      }
      return escalated;
    });
  }

  /** [Fix round, Important 8] Never throws — a digest failure (including
   * EmailService.sendEmail throwing outright on a template-compile
   * error, not just returning false) is caught and logged here so it can
   * never abort runOnce's OTHER branch. */
  private async trySendDigest(
    subject: string,
    intro: string,
    items: string[],
  ): Promise<void> {
    try {
      await this.sendDigest(subject, intro, items);
    } catch (err) {
      this.logger.error(
        `complaint-sla-sweep: digest email threw for "${subject}": ${(err as Error).message}`,
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
        `complaint-sla-sweep: OPS_ALERT_EMAIL is not configured — skipping the digest email (the error log above is the standing record).`,
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
        `complaint-sla-sweep: failed to send the ops digest email (subject: ${subject}).`,
      );
    }
  }
}
