import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { queryStoreIdsWithLiveOfferToday } from "../discovery/live-offer.util";

function storeNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "STORE_NOT_FOUND",
    message: "Store not found.",
  });
}

export interface FavoriteListItem {
  storeId: string;
  favoritedAt: Date;
  store: {
    id: string;
    name: string;
    district: string;
    city: string;
    coverImageUrl: string | null;
    avgStars: number;
    ratingCount: number;
    active: boolean;
  };
  /** Reuses the discovery module's own "live offer" predicate via a
   * shared batch query (live-offer.util.ts) — never a second copy of
   * discovery's SQL, per the brief. */
  hasLiveOfferToday: boolean;
}

export interface FavoriteListResult {
  items: FavoriteListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Favorites (§1 of the brief) — a plain many-to-many between User and
 * Store, made idempotent BOTH ways so a client can fire-and-forget a
 * toggle without tracking local state: adding an already-favorited store
 * is a silent no-op (upsert on the @@unique([userId, storeId]) index,
 * never a 409); removing a not-favorited one is a silent no-op
 * (deleteMany matches 0 rows without erroring either way). Task 7's
 * offer.published.v1 fan-out already reads this table (favoritesEnabled
 * gate) — nothing here changes its semantics, this module only adds the
 * write/list surface.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, storeId: string): Promise<{ favorited: true }> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) throw storeNotFoundError();

    await this.prisma.favorite.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId },
      update: {},
    });
    return { favorited: true };
  }

  async remove(userId: string, storeId: string): Promise<{ favorited: false }> {
    await this.prisma.favorite.deleteMany({ where: { userId, storeId } });
    return { favorited: false };
  }

  async listMine(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<FavoriteListResult> {
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              district: true,
              city: true,
              coverImageUrl: true,
              avgStars: true,
              ratingCount: true,
              active: true,
            },
          },
        },
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    // One batched query for the whole page's "has a live offer today"
    // flag — never N+1 (see live-offer.util.ts).
    const liveToday = await queryStoreIdsWithLiveOfferToday(
      this.prisma,
      rows.map((r) => r.storeId),
    );

    const items: FavoriteListItem[] = rows.map((r) => ({
      storeId: r.storeId,
      favoritedAt: r.createdAt,
      store: r.store,
      hasLiveOfferToday: liveToday.has(r.storeId),
    }));

    return { items, total, page, pageSize };
  }
}
