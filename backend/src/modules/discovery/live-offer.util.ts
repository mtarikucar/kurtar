import { Prisma } from "@prisma/client";

/**
 * The "does this store have a live, bookable offer right now" predicate —
 * the six conditions `discovery.service.ts`'s `queryOffers`/`map` already
 * apply (status PUBLISHED, stock left, pickup window not yet over, the
 * store active, the bag template active, the owning merchant APPROVED).
 * Extracted here so a THIRD consumer — modules/favorites' "does this
 * favorited store have a live offer today" batch check — reuses the exact
 * same shape instead of a second, driftable copy of the same SQL (Task 9
 * brief: "reuse the discovery query shape ... do NOT duplicate its SQL").
 * `queryOffers`/`map` were refactored to call this too, so there is now
 * exactly one place these six fragments are written.
 */
export function buildLiveOfferConditions(now: Date): Prisma.Sql[] {
  return [
    Prisma.sql`d."status" = 'PUBLISHED'`,
    Prisma.sql`d."qtyReserved" < d."qtyTotal"`,
    Prisma.sql`d."pickupEndAt" > ${now}`,
    Prisma.sql`s."active" = true`,
    Prisma.sql`bt."active" = true`,
    Prisma.sql`m."verificationStatus" = 'APPROVED'`,
  ];
}

/**
 * Batch existence check: which of `storeIds` have at least one live offer
 * right now. One query regardless of how many store ids are passed in
 * (favorites.service.ts calls this once per page of favorites, never
 * per-row — avoiding the N+1 a naive "check each favorite's store"
 * implementation would produce). Returns a Set for O(1) membership tests
 * at the call site.
 */
export async function queryStoreIdsWithLiveOfferToday(
  prisma: { $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T> },
  storeIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (storeIds.length === 0) return new Set();

  const conditions = [
    ...buildLiveOfferConditions(now),
    Prisma.sql`d."storeId" IN (${Prisma.join(storeIds)})`,
  ];
  const whereClause = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<Array<{ storeId: string }>>(Prisma.sql`
    SELECT DISTINCT d."storeId" AS "storeId"
    FROM "daily_offers" d
    JOIN "stores" s ON s."id" = d."storeId"
    JOIN "bag_templates" bt ON bt."id" = d."bagTemplateId"
    JOIN "merchants" m ON m."id" = s."merchantId"
    WHERE ${whereClause}
  `);
  return new Set(rows.map((r) => r.storeId));
}
