import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OutboxEventHandler } from "../outbox/outbox-handler.interface";
import {
  OUTBOX_EVENT_TYPES,
  ReservationRedeemedImpactV1Payload,
} from "../outbox/event-types";
import { computeImpactLine } from "./impact-math";
import { CO2E_PER_BAG_GRAMS_DEFAULT } from "./impact.constants";

function resolveCo2ePerBagGrams(config: ConfigService): number {
  const raw = config.get<string>("CO2E_PER_BAG_GRAMS");
  if (!raw) return CO2E_PER_BAG_GRAMS_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : CO2E_PER_BAG_GRAMS_DEFAULT;
}

/**
 * reservation.redeemed.impact.v1 -> one ImpactLedger row. Idempotency is
 * enforced by ImpactLedger.reservationId's real DB unique constraint, NOT
 * a pre-check read (a check-then-create has a TOCTOU window) — a second
 * dispatch of the SAME event (brief §8, realdb (c): "impact row written
 * exactly once even if the redeemed event is dispatched twice") hits
 * P2002 and is swallowed as a benign no-op, not retried, not logged as an
 * error. Any OTHER failure still throws (normal outbox retry/backoff).
 */
@Injectable()
export class ImpactLedgerHandler implements OutboxEventHandler, OnModuleInit {
  readonly types = [OUTBOX_EVENT_TYPES.RESERVATION_REDEEMED_IMPACT_V1];
  private readonly logger = new Logger(ImpactLedgerHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as ReservationRedeemedImpactV1Payload;
    const co2ePerBagGrams = resolveCo2ePerBagGrams(this.config);
    const line = computeImpactLine({
      qty: payload.qty,
      co2ePerBagGrams,
      totalCents: payload.totalCents,
      originalValueCentsMin: payload.originalValueCentsMin,
      originalValueCentsMax: payload.originalValueCentsMax,
    });

    try {
      await this.prisma.impactLedger.create({
        data: {
          reservationId: payload.reservationId,
          userId: payload.userId,
          storeId: payload.storeId,
          mealsSaved: line.mealsSaved,
          co2eGrams: line.co2eGrams,
          moneySavedCents: line.moneySavedCents,
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, "reservationId")) {
        this.logger.log(
          `ImpactLedger row already exists for reservation ${payload.reservationId} — dispatched twice, no-op.`,
        );
        return;
      }
      throw err;
    }
  }
}
