import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { PushDispatchService } from "../../notifications/push/push-dispatch.service";
import { OUTBOX_EVENT_TYPES, OfferPublishedV1Payload } from "../event-types";
import { OutboxHandlerRegistry } from "../outbox-handler.registry";
import { OutboxEventHandler } from "../outbox-handler.interface";

/**
 * [Fix round, Important 4] Both candidate queries are keyset-paginated
 * rather than a single `take: N` — a flat cap applied BEFORE the
 * NotificationPolicy filter meant opted-out users could consume slots
 * opted-in users beyond the cutoff never got a chance at (Prisma's
 * unordered `findMany` also made WHICH rows got cut off nondeterministic
 * — no ORDER BY). Paginating means every genuinely qualifying candidate
 * gets INTO the set that's handed to PushDispatchService (which applies
 * the real policy filter), all the way up to a per-store ceiling
 * (PAGE_SIZE * MAX_PAGES) that's astronomically larger than any real
 * store's favoriter/nearby count — in virtually every real publish, the
 * loop exhausts naturally long before the ceiling, so "bounded" and
 * "don't truncate before policy filtering" both hold. Hitting the ceiling
 * is logged loudly (it means real people were provably left out).
 */
const FAVORITES_PAGE_SIZE = 500;
const FAVORITES_MAX_PAGES = 20; // 10,000-favoriter ceiling
const NEARBY_PAGE_SIZE = 500;
const NEARBY_MAX_PAGES = 20; // 10,000-nearby-user ceiling

/**
 * offer.published.v1 -> fan-out push to (a) users who favorited the store
 * and (b) users with nearbyEnabled whose last known location is within
 * their own configured radius (ST_DWithin against stores.location) (brief
 * §5). Deduped: a user in BOTH sets gets exactly one push, via the
 * OFFER_FAVORITE kind (the stronger, explicit opt-in signal) — see
 * NotificationPolicyService's table for why favorites/nearby are distinct
 * NotificationKinds even though both come from this one event type.
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

    const [favoriteUserIds, nearbyUserIds, store, bagTemplate] =
      await Promise.all([
        this.fetchFavoriteUserIds(payload.storeId),
        this.queryNearbyUserIds(payload.storeId),
        this.prisma.store.findUnique({
          where: { id: payload.storeId },
          select: { name: true },
        }),
        this.prisma.bagTemplate.findUnique({
          where: { id: payload.bagTemplateId },
          select: { title: true },
        }),
      ]);

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

  /** Favoriters of the store — favoritesEnabled defaults TRUE (schema.prisma),
   * so this deliberately does NOT filter on it (a false negative would be
   * possible if it did, for anyone who never touched their prefs);
   * PushDispatchService's NotificationPolicy check is the real gate. */
  private async fetchFavoriteUserIds(storeId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < FAVORITES_MAX_PAGES; page++) {
      const rows = await this.prisma.favorite.findMany({
        where: { storeId, user: { status: "ACTIVE" } },
        select: { id: true, userId: true },
        orderBy: { id: "asc" },
        take: FAVORITES_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      ids.push(...rows.map((r) => r.userId));
      if (rows.length < FAVORITES_PAGE_SIZE) return ids; // exhausted
      cursor = rows[rows.length - 1].id;
    }

    this.logger.warn(
      `offer.published.v1: favorites fan-out for store ${storeId} hit the ${FAVORITES_MAX_PAGES * FAVORITES_PAGE_SIZE}-row safety ceiling — some favoriters beyond it were NOT notified for this publish.`,
    );
    return ids;
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
   * subquery). Keyset-paginated on u."id" — see this file's top doc
   * comment.
   */
  private async queryNearbyUserIds(storeId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < NEARBY_MAX_PAGES; page++) {
      const cursorClause: Prisma.Sql = cursor
        ? Prisma.sql`AND u."id" > ${cursor}`
        : Prisma.empty;
      const query: Prisma.Sql = Prisma.sql`
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
          ${cursorClause}
        ORDER BY u."id" ASC
        LIMIT ${NEARBY_PAGE_SIZE}
      `;
      const rows: Array<{ userId: string }> =
        await this.prisma.$queryRaw<Array<{ userId: string }>>(query);
      ids.push(...rows.map((r) => r.userId));
      if (rows.length < NEARBY_PAGE_SIZE) return ids; // exhausted
      cursor = rows[rows.length - 1].userId;
    }

    this.logger.warn(
      `offer.published.v1: nearby fan-out for store ${storeId} hit the ${NEARBY_MAX_PAGES * NEARBY_PAGE_SIZE}-row safety ceiling — some in-radius users beyond it were NOT notified for this publish.`,
    );
    return ids;
  }
}
