import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { PushDispatchService } from "../notifications/push/push-dispatch.service";

const PICKUP_REMINDER_WINDOW_MS = 30 * 60 * 1000; // 30 min
/** Bounded batch per sweep tick — a large due-list is drained over
 * several 5-minute ticks rather than one tick ever processing an
 * unbounded number of rows. */
const PICKUP_REMINDER_BATCH_LIMIT = 200;

function formatPickupWindow(pickupStartAt: Date, pickupEndAt: Date): string {
  const fmt = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(pickupStartAt)}-${fmt.format(pickupEndAt)}`;
}

/**
 * Every-5-minute sweep for CONFIRMED reservations whose pickup window
 * opens within the next 30 minutes and haven't been reminded yet (brief
 * §5). Not outbox-routed — a direct cron -> push, like
 * PaymentsSweeperService / OffersPublishSchedulerService's own cron
 * sweeps elsewhere in this codebase.
 *
 * Double-send safety: each candidate's actual "claim" is its own guarded
 * `updateMany({ where: { id, pickupReminderSentAt: null } })` — the SAME
 * pattern publishedAt/redeemedAt use elsewhere (offers.service.ts,
 * reservations.service.ts). Two concurrent sweeps (two replicas, or two
 * overlapping ticks) racing the same reservation resolve to exactly one
 * winner; the loser's updateMany matches 0 rows and it skips the push.
 * Transactional (PICKUP_REMINDER in NOTIFICATION_POLICY_TABLE) — ignores
 * quiet hours, since the pickup window itself is the deadline, not
 * something that can wait until morning.
 */
@Injectable()
export class PickupReminderCronService {
  private readonly logger = new Logger(PickupReminderCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushDispatch: PushDispatchService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: "pickup-reminder-sweep" })
  async sweep(): Promise<void> {
    const result = await this.sweepOnce();
    if (result.reminded > 0) {
      this.logger.log(
        `Pickup reminder: reminded ${result.reminded} reservation(s)`,
      );
    }
  }

  /** Not private — realdb specs call this directly instead of waiting on
   * the cron schedule, with explicit `now`/`windowMs` rather than sleeping
   * on real time. */
  async sweepOnce(
    now: Date = new Date(),
    windowMs: number = PICKUP_REMINDER_WINDOW_MS,
  ): Promise<{ reminded: number }> {
    const windowEnd = new Date(now.getTime() + windowMs);
    const due = await this.prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        pickupReminderSentAt: null,
        offer: { pickupStartAt: { gte: now, lte: windowEnd } },
      },
      select: {
        id: true,
        userId: true,
        storeId: true,
        code: true,
        offer: { select: { pickupStartAt: true, pickupEndAt: true } },
      },
      take: PICKUP_REMINDER_BATCH_LIMIT,
    });

    let reminded = 0;
    for (const reservation of due) {
      const claimed = await this.prisma.reservation.updateMany({
        where: { id: reservation.id, pickupReminderSentAt: null },
        data: { pickupReminderSentAt: new Date() },
      });
      if (claimed.count === 0) continue; // lost the race to a concurrent sweep

      await this.pushDispatch.notifyUsers(
        [reservation.userId],
        "PICKUP_REMINDER",
        () => ({
          title: "Teslim alma zamanı yaklaşıyor",
          body: `Teslim alma kodun: ${reservation.code}. Pencere: ${formatPickupWindow(
            reservation.offer.pickupStartAt,
            reservation.offer.pickupEndAt,
          )}.`,
          data: { reservationId: reservation.id, storeId: reservation.storeId },
        }),
      );
      reminded++;
    }
    return { reminded };
  }
}
