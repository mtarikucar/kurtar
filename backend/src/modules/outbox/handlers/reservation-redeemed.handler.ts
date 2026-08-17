import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import {
  OUTBOX_EVENT_TYPES,
  ReservationRedeemedV1Payload,
} from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/**
 * reservation.redeemed.v1 -> rating-invite push. The event itself is
 * queued at redeem time with `scheduledFor` set +2h (see
 * reservations.service.ts's redeem()) — by the time the worker ever
 * dispatches THIS handler, the 2 hours have already passed, so nothing
 * here deals with the delay itself. NOT transactional
 * (NOTIFICATION_POLICY_TABLE — RATING_INVITE) — a feedback nudge, unlike
 * the brief's explicit transactional list (confirm/reminder/refund), so it
 * respects quiet hours like a normal discovery push.
 */
@Injectable()
export class ReservationRedeemedHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.RESERVATION_REDEEMED_V1];
  private readonly logger = new Logger(ReservationRedeemedHandler.name);

  constructor(
    private readonly pushDispatch: PushDispatchService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as ReservationRedeemedV1Payload;

    const result = await this.pushDispatch.notifyUsers(
      [payload.userId],
      "RATING_INVITE",
      () => ({
        title: "Nasıldı?",
        body: "Az önce teslim aldığın paketi değerlendirmeye ne dersin?",
        data: {
          reservationId: payload.reservationId,
          storeId: payload.storeId,
          action: "RATE",
        },
      }),
    );
    this.logger.log(
      `reservation.redeemed.v1 rating-invite push for reservation ${payload.reservationId}: sent=${result.sent}`,
    );
  }
}
