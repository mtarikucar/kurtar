import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import {
  OUTBOX_EVENT_TYPES,
  ReservationConfirmedV1Payload,
} from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

function formatPickupWindow(
  pickupStartAt: string,
  pickupEndAt: string,
): string {
  const fmt = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(pickupStartAt))}-${fmt.format(new Date(pickupEndAt))}`;
}

/**
 * reservation.confirmed.v1 -> push the consumer with their pickup window +
 * code (brief §5). Transactional (NOTIFICATION_POLICY_TABLE) — ignores
 * quiet hours and marketing prefs; a paid confirmation must reach the
 * customer regardless of the hour.
 */
@Injectable()
export class ReservationConfirmedHandler
  implements OutboxEventHandler, OnModuleInit
{
  readonly types = [OUTBOX_EVENT_TYPES.RESERVATION_CONFIRMED_V1];
  private readonly logger = new Logger(ReservationConfirmedHandler.name);

  constructor(
    private readonly pushDispatch: PushDispatchService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as ReservationConfirmedV1Payload;

    const result = await this.pushDispatch.notifyUsers(
      [payload.userId],
      "RESERVATION_CONFIRMED",
      () => ({
        title: "Rezervasyonun onaylandı",
        body: `Teslim alma kodun: ${payload.code}. Teslim penceresi: ${formatPickupWindow(
          payload.pickupStartAt,
          payload.pickupEndAt,
        )}.`,
        data: {
          reservationId: payload.reservationId,
          offerId: payload.offerId,
          storeId: payload.storeId,
        },
      }),
    );
    this.logger.log(
      `reservation.confirmed.v1 push for reservation ${payload.reservationId}: sent=${result.sent}`,
    );
  }
}
