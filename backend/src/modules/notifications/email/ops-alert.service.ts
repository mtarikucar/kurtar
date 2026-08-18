import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "./email.service";

/**
 * [Fix round #6, I1/I4] The shared OPS_ALERT_EMAIL digest channel.
 *
 * Two crons already had this exact helper copy-pasted into them
 * (complaint-sla-cron.service.ts:178-215 and
 * moderation-takedown-cron.service.ts) and, before this round, they were
 * also the ONLY two places in the codebase that could reach an operator
 * at all: `grep OPS_ALERT_EMAIL backend/src` returned nothing else. So
 * the settlement payout SLA — the one regulated clock in the product,
 * "payout within 5 business days" — and a failed commission e-fatura
 * both had a `logger.error` and nothing more. Rather than paste the same
 * ~35 lines into a third and fourth service, the behaviour lives here
 * once and is exported by EmailModule.
 *
 * Behaviour is deliberately identical to the copies it generalises:
 *
 *  - NEVER throws. EmailService.sendEmail throws outright on a
 *    template-compile failure (not just returns false), and a digest that
 *    can abort its caller has already caused one real defect in this
 *    codebase — the complaint cron's breach branch being skipped because
 *    the warn branch's email threw. Callers get a boolean.
 *  - Degrades to a log line when OPS_ALERT_EMAIL is unset, so an
 *    unconfigured environment is loud rather than silently muted.
 *  - The caller ALWAYS logs its own error line first; this is an
 *    additional channel, never the record of last resort.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Returns true only when a message was actually handed to the mail
   * transport. Never throws. */
  async trySend(
    subject: string,
    intro: string,
    items: string[],
  ): Promise<boolean> {
    try {
      const opsEmail = this.config.get<string>("OPS_ALERT_EMAIL");
      if (!opsEmail) {
        this.logger.warn(
          `OPS_ALERT_EMAIL is not configured — skipping the ops digest "${subject}" (the caller's error log is the standing record).`,
        );
        return false;
      }
      const sent = await this.email.sendEmail({
        to: opsEmail,
        subject,
        template: "ops-alert",
        context: { title: subject, intro, items },
      });
      if (!sent) {
        this.logger.error(`Failed to send the ops digest email "${subject}".`);
      }
      return sent;
    } catch (err) {
      this.logger.error(
        `Ops digest email threw for "${subject}": ${(err as Error).message}`,
      );
      return false;
    }
  }
}
