import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { OUTBOX_EVENT_TYPES, OfferPublishedV1Payload } from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/** Bounded batches per the brief — a viral store's favorite count or a
 * dense nearby radius must never turn one publish into an unbounded fan-
 * out query. */
const FAVORITES_FANOUT_LIMIT = 2000;
const NEARBY_FANOUT_LIMIT = 500;

/**
 * offer.published.v1 -> fan-out push to (a) users who favorited the store
 * and (b) users with nearbyEnabled whose last known location is within
 * their own configured nearbyRadiusM of the store (brief §5). Deduped: a
 * user in BOTH sets gets exactly one push, via the OFFER_FAVORITE kind
 * (the stronger, explicit opt-in signal) — see NotificationPolicyService's
 * table for why favorites/nearby are distinct NotificationKinds even
 * though both come from this one event type.
 */
@Injectable()
export class OfferPublishedHandler implements OutboxEventHandler, OnModuleInit {
  readonly types = [OUTBOX_EVENT_TYPES.OFFER_PUBLISHED_V1];
  private readonly logger = new Logger(OfferPublishedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushDispatch: PushDispatchService,
    private readonly registry: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(rawPayload: unknown): Promise<void> {
    const payload = rawPayload as OfferPublishedV1Payload;

    const [favoriteRows, nearbyUserIds, store, bagTemplate] = await Promise.all(
      [
        this.prisma.favorite.findMany({
          where: { storeId: payload.storeId, user: { status: "ACTIVE" } },
          select: { userId: true },
          take: FAVORITES_FANOUT_LIMIT,
        }),
        this.queryNearbyUserIds(payload.storeId),
        this.prisma.store.findUnique({
          where: { id: payload.storeId },
          select: { name: true },
        }),
        this.prisma.bagTemplate.findUnique({
          where: { id: payload.bagTemplateId },
          select: { title: true },
        }),
      ],
    );

    const favoriteUserIds = favoriteRows.map((r) => r.userId);
    const favoriteSet = new Set(favoriteUserIds);
    // Dedupe (a) ∪ (b): anyone already reached via favorites is dropped
    // from the nearby audience.
    const onlyNearbyUserIds = nearbyUserIds.filter(
      (id) => !favoriteSet.has(id),
    );

    const storeName = store?.name ?? "Bir mağaza";
    const bagTitle = bagTemplate?.title ?? "yeni bir paket";
    const buildMessage = () => ({
      title: "Yeni paket yayında!",
      body: `${storeName}, "${bagTitle}" paketini yayınladı.`,
      data: { offerId: payload.offerId, storeId: payload.storeId },
    });

    const [favoritesResult, nearbyResult] = await Promise.all([
      this.pushDispatch.notifyUsers(
        favoriteUserIds,
        "OFFER_FAVORITE",
        buildMessage,
      ),
      this.pushDispatch.notifyUsers(
        onlyNearbyUserIds,
        "OFFER_NEARBY",
        buildMessage,
      ),
    ]);

    this.logger.log(
      `offer.published.v1 fan-out for offer ${payload.offerId}: favorites sent=${favoritesResult.sent}/${favoritesResult.candidates}, nearby sent=${nearbyResult.sent}/${nearbyResult.candidates}`,
    );
  }

  /**
   * Per-user radius (np."nearbyRadiusM", not a single global constant) —
   * respects each user's own configured NotificationPreference.nearbyRadiusM.
   * `np."nearbyEnabled" = true` is a real INNER JOIN filter here (not left
   * to NotificationPolicy alone): nearbyEnabled defaults to FALSE
   * (schema.prisma), so a user with no preference row is correctly
   * excluded at the candidate-query level already — unlike favorites
   * (default TRUE), pruning here can never produce a false negative.
   * PushDispatchService's NotificationPolicy check still re-verifies this
   * per user before sending (defense in depth, same "close the same hole
   * twice" pattern as offer-stock.service.ts's merchant-approval EXISTS
   * subquery).
   */
  private async queryNearbyUserIds(storeId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string }>
    >(Prisma.sql`
      SELECT u."id" AS "userId"
      FROM "users" u
      JOIN "notification_preferences" np ON np."userId" = u."id"
      JOIN "stores" s ON s."id" = ${storeId}
      WHERE u."status" = 'ACTIVE'
        AND np."nearbyEnabled" = true
        AND u."lastLat" IS NOT NULL
        AND u."lastLng" IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(u."lastLng", u."lastLat"), 4326)::geography,
          s."location",
          np."nearbyRadiusM"
        )
      LIMIT ${NEARBY_FANOUT_LIMIT}
    `);
    return rows.map((r) => r.userId);
  }
}
