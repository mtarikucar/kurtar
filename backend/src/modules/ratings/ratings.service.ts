import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ModerationStatus, Prisma, Rating } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { CreateRatingDto } from "./dto/create-rating.dto";

function reservationNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "RESERVATION_NOT_FOUND",
    message: "Reservation not found.",
  });
}

function notOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This reservation does not belong to you.",
  });
}

function notEligibleError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "RATING_NOT_ELIGIBLE",
    message: "Only a REDEEMED reservation can be rated.",
  });
}

function ratingAlreadyExistsError() {
  return new ConflictException({
    statusCode: 409,
    errorCode: "RATING_ALREADY_EXISTS",
    message: "This reservation has already been rated.",
  });
}

function ratingNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "RATING_NOT_FOUND",
    message: "Rating not found.",
  });
}

function notStoreOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This store does not belong to you.",
  });
}

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/**
 * Ratings (§2 of the brief). Every mutation that can change which ratings
 * count as APPROVED (create-as-APPROVED, approve, reject, delete) funnels
 * through this service so `recomputeStoreAggregate` — the ONLY writer of
 * Store.avgStars/ratingCount — always runs in the SAME transaction as the
 * Rating row change. Never incremented/decremented in place: a full
 * storeId-scoped re-derivation every time is what makes repeated calls
 * (an admin re-approving, a report-driven reject after an earlier
 * approve) safe without double-counting — same "recompute from scratch,
 * scoped to one entity" philosophy as Task 8's settlement recomputeBatch.
 *
 * Visibility policy (brief: "decide and document"): a rating with an
 * EMPTY comment is auto-APPROVED at creation (nothing for a human to
 * moderate, and most ratings are a bare star tap — gating those on an
 * admin would silently stall every store's average for no reason). A
 * rating WITH a comment starts PENDING and needs an explicit admin
 * approve/reject (adminApprove/adminReject below, or a content-report
 * "action" on a RATING target reusing adminReject — modules/moderation)
 * before it counts toward the aggregate or shows up anywhere public.
 */
@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    reservationId: string,
    dto: CreateRatingDto,
  ): Promise<Rating> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, userId: true, storeId: true, status: true },
    });
    if (!reservation) throw reservationNotFoundError();
    if (reservation.userId !== userId) throw notOwnerError();
    if (reservation.status !== "REDEEMED") throw notEligibleError();

    const trimmedComment = dto.comment?.trim();
    const hasComment = Boolean(trimmedComment);
    const moderationStatus: ModerationStatus = hasComment
      ? "PENDING"
      : "APPROVED";

    try {
      return await this.prisma.$transaction(async (tx) => {
        // [Fix round, Critical 2 — deadlock found while testing the fix]
        // When this create will touch the aggregate, the store row MUST
        // be locked BEFORE the insert, not after. `tx.rating.create`
        // below inserts a row whose `storeId` FK makes Postgres take a
        // SHARE lock on the referenced store row as part of the FK
        // check; recomputeStoreAggregate's own `FOR UPDATE` (EXCLUSIVE)
        // taken AFTERWARD in the same transaction then races two
        // concurrent creates for the SAME store into a classic lock-
        // upgrade deadlock (TX1 holds a SHARE lock from its own insert
        // and waits to upgrade to EXCLUSIVE; TX2 does the same; neither
        // can proceed — reproduced live via 8-way concurrent creates in
        // ratings.realdb.spec.ts before this fix, a real Postgres
        // `40P01 deadlock detected`). Locking FIRST means only one
        // transaction ever holds any lock on the row at a time — a
        // transaction re-acquiring `FOR UPDATE` on a row it already
        // holds (recomputeStoreAggregate's own internal lock, below) is
        // an instant no-op against itself.
        if (moderationStatus === "APPROVED") {
          await tx.$queryRaw`SELECT "id" FROM "stores" WHERE "id" = ${reservation.storeId} FOR UPDATE`;
        }

        const rating = await tx.rating.create({
          data: {
            reservationId,
            userId,
            storeId: reservation.storeId,
            overallStars: dto.overallStars,
            foodQuality: dto.foodQuality,
            service: dto.service,
            comment: hasComment ? trimmedComment : null,
            moderationStatus,
          },
        });
        if (moderationStatus === "APPROVED") {
          await this.recomputeStoreAggregate(tx, reservation.storeId);
        }
        return rating;
      });
    } catch (err) {
      // [Brief §8, realdb (a)] Two parallel POSTs for the SAME
      // reservation race on Rating.reservationId's unique constraint —
      // exactly one create wins, the other lands here and gets a
      // friendly 409 instead of a raw 500.
      if (isUniqueConstraintViolation(err, "reservationId")) {
        throw ratingAlreadyExistsError();
      }
      throw err;
    }
  }

  /** MERCHANT, own stores — recent ratings (every status, so the
   * merchant can see their own PENDING queue in context) + the APPROVED
   * distribution. Never exposes the reviewing consumer's identity. */
  async listMine(
    merchantId: string,
    storeId: string,
    page: number,
    pageSize: number,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { merchantId: true, avgStars: true, ratingCount: true },
    });
    if (!store)
      throw new NotFoundException({
        statusCode: 404,
        errorCode: "STORE_NOT_FOUND",
        message: "Store not found.",
      });
    if (store.merchantId !== merchantId) throw notStoreOwnerError();

    const skip = (page - 1) * pageSize;
    const [items, total, distributionRows, pendingCount] = await Promise.all([
      this.prisma.rating.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          overallStars: true,
          foodQuality: true,
          service: true,
          comment: true,
          moderationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.rating.count({ where: { storeId } }),
      this.prisma.rating.groupBy({
        by: ["overallStars"],
        where: { storeId, moderationStatus: "APPROVED" },
        _count: { _all: true },
      }),
      this.prisma.rating.count({
        where: { storeId, moderationStatus: "PENDING" },
      }),
    ]);

    const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distributionRows) {
      const star = row.overallStars as 1 | 2 | 3 | 4 | 5;
      if (star >= 1 && star <= 5) distribution[star] = row._count._all;
    }

    return {
      storeId,
      avgStars: store.avgStars,
      ratingCount: store.ratingCount,
      distribution,
      pendingCount,
      items,
      total,
      page,
      pageSize,
    };
  }

  /** Admin moderation queue — every status unless filtered. */
  async adminList(
    status: ModerationStatus | undefined,
    storeId: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(status && { moderationStatus: status }),
      ...(storeId && { storeId }),
    };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
      }),
      this.prisma.rating.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async adminApprove(adminId: string, ratingId: string): Promise<Rating> {
    return this.moderate(adminId, ratingId, "APPROVED", "rating.approve");
  }

  /** Also the reuse point for modules/moderation's content-report
   * "action" on a RATING target — the SAME method, so a rejected rating
   * is hidden identically regardless of which surface triggered it. */
  async rejectRating(adminId: string, ratingId: string): Promise<Rating> {
    return this.moderate(adminId, ratingId, "REJECTED", "rating.reject");
  }

  private async moderate(
    adminId: string,
    ratingId: string,
    to: ModerationStatus,
    action: string,
  ): Promise<Rating> {
    return this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.findUnique({ where: { id: ratingId } });
      if (!rating) throw ratingNotFoundError();
      if (rating.moderationStatus === to) return rating; // idempotent no-op

      const updated = await tx.rating.update({
        where: { id: ratingId },
        data: { moderationStatus: to },
      });
      // Either side of the transition (APPROVED involved, either as the
      // from- or to- state) can change the aggregate — recompute
      // unconditionally rather than trying to reason about which single
      // direction matters; it's one cheap, storeId-scoped query.
      await this.recomputeStoreAggregate(tx, rating.storeId);
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action,
          entity: "Rating",
          entityId: ratingId,
          diffJson: { from: rating.moderationStatus, to },
        },
      });
      return updated;
    });
  }

  async adminDelete(adminId: string, ratingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rating = await tx.rating.findUnique({ where: { id: ratingId } });
      if (!rating) throw ratingNotFoundError();

      await tx.rating.delete({ where: { id: ratingId } });
      await this.recomputeStoreAggregate(tx, rating.storeId);
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          action: "rating.delete",
          entity: "Rating",
          entityId: ratingId,
          diffJson: { deletedModerationStatus: rating.moderationStatus },
        },
      });
    });
  }

  /**
   * The ONLY writer of Store.avgStars/ratingCount — a full re-derivation
   * from the APPROVED subset of this ONE store's ratings (indexed by
   * [storeId, moderationStatus]), never a platform-wide scan and never a
   * per-request read-path query (every GET reads the denormalized
   * columns directly). Called inside the SAME transaction as the write
   * that changed APPROVED membership, so the two can never observably
   * disagree.
   *
   * [Fix round, Critical 2] `SELECT ... FOR UPDATE` on the store row is
   * the FIRST statement here, before the aggregate read — without it,
   * two concurrent recomputes for the SAME store race under Prisma's
   * default READ COMMITTED isolation: TX1 creates its rating and
   * aggregates (sees only its own row, since TX2's insert hasn't
   * committed yet); TX2 does the same concurrently (sees only ITS OWN
   * row); whichever commits last overwrites the store with a count that
   * only ever reflects ONE of the two ratings — a genuine, permanent
   * undercount (self-healing only the next time this store is next
   * mutated, which could be weeks later). Locking the store row first
   * serializes concurrent recomputes for the SAME store: the second
   * transaction's lock acquisition blocks until the first commits, so
   * its subsequent aggregate re-reads see the first's now-committed row
   * too — exactly the "combined with the row lock" requirement
   * settlement-batch-builder.service.ts's recomputeBatch documents (and
   * implements via the identical `FOR UPDATE` shape) for the same
   * recompute-from-scratch pattern. Proven under genuine concurrency in
   * ratings.realdb.spec.ts's "[Critical 2]" scenario.
   *
   * CALLER WARNING: if a caller's OWN transaction also INSERTS a Rating
   * row referencing this same storeId (create() does — the FK check on
   * that insert takes a SHARE lock on the store row), that insert MUST
   * happen AFTER this method's lock is acquired, never before — see
   * create()'s own comment for the lock-upgrade deadlock this avoids
   * (reproduced live, a real Postgres 40P01, before that ordering fix).
   * moderate()/adminDelete() have no such hazard (an UPDATE that leaves
   * storeId unchanged, and a DELETE of the child, never take a lock on
   * the parent), so calling this method as their very own first
   * storeId-touching statement is always safe.
   */
  private async recomputeStoreAggregate(
    tx: Prisma.TransactionClient,
    storeId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "stores" WHERE "id" = ${storeId} FOR UPDATE`;

    const agg = await tx.rating.aggregate({
      where: { storeId, moderationStatus: "APPROVED" },
      _avg: { overallStars: true },
      _count: { _all: true },
    });
    await tx.store.update({
      where: { id: storeId },
      data: {
        avgStars: agg._avg.overallStars ?? 0,
        ratingCount: agg._count._all,
      },
    });
  }
}
