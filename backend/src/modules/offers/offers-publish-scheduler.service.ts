import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OffersService } from "./offers.service";

/**
 * Every-minute sweep for SCHEDULED offers whose publishAt has arrived —
 * "Publish scheduler cron (every minute): SCHEDULED with publishAt<=now →
 * PUBLISHED" per the brief. Delegates entirely to
 * OffersService.publishDueScheduled(), which reuses the EXACT SAME
 * transition + outbox-write logic the manual POST /offers/:id/publish
 * endpoint uses (offers.service.ts's private publishOffer) — this class
 * only owns the schedule, not the business logic.
 *
 * No jitter yet (per the brief: "Jitter comes later with push fan-out") —
 * every due offer in a tick publishes immediately, back-to-back. That's
 * fine today since nothing downstream reacts to offer.published.v1 yet
 * (the outbox worker lands in a later task); jitter only matters once a
 * publish burst also means a push-notification burst.
 *
 * Single-instance assumption, same as PaymentsSweeperService: no advisory
 * lock guards this against running on two replicas at once. Harmless
 * under concurrency regardless — publishOffer's guarded updateMany is
 * itself idempotent (a second replica racing the same offer just finds
 * 0 rows matched and moves on).
 */
@Injectable()
export class OffersPublishSchedulerService {
  private readonly logger = new Logger(OffersPublishSchedulerService.name);

  constructor(private readonly offers: OffersService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "offers-publish-scheduled" })
  async sweepDueScheduled(): Promise<void> {
    const { publishedCount, failedCount } =
      await this.offers.publishDueScheduled();
    if (publishedCount > 0 || failedCount > 0) {
      this.logger.log(
        `Publish-scheduler: published ${publishedCount}, failed ${failedCount}`,
      );
    }
  }
}
