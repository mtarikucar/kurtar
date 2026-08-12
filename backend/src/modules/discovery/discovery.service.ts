import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DietFlag, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../../common/utils/istanbul-date.util";
import { buildDiscoveryOffersCacheKey } from "./discovery-cache-key.util";
import { DiscoveryCacheService } from "./discovery-cache.service";
import { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";
import { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";

const OFFERS_CACHE_TTL_SECONDS = 45;
// "reject boxes larger than ~1 degree²" per the brief.
const MAX_BBOX_AREA_DEG2 = 1;

export interface DiscoveryOfferItem {
  offerId: string;
  store: { id: string; name: string; district: string; distanceM: number };
  template: {
    title: string;
    category: string;
    dietFlags: string[];
    priceCents: number;
    originalValueCentsMin: number;
    originalValueCentsMax: number;
  };
  pickupStartAt: Date;
  pickupEndAt: Date;
  qtyLeft: number;
  coverImageUrl: string | null;
}

export interface DiscoveryOffersResult {
  items: DiscoveryOfferItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DiscoveryMapPin {
  storeId: string;
  lat: number;
  lng: number;
  minPriceCents: number;
  offersCount: number;
}

function storeNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "STORE_NOT_FOUND",
    message: "Store not found.",
  });
}

function parseDietFlags(diet: string | undefined): DietFlag[] | undefined {
  if (!diet) return undefined;
  const values = diet
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (values.length === 0) return undefined;

  const valid = new Set(Object.values(DietFlag));
  for (const value of values) {
    if (!valid.has(value as DietFlag)) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "DISCOVERY_DIET_INVALID",
        message: `"${value}" is not a valid diet flag. Valid values: ${[...valid].join(", ")}.`,
      });
    }
  }
  return values as DietFlag[];
}

/**
 * @Public discovery surface (§4 of the brief) — PostGIS-backed nearby
 * search, a map-pin bbox query, and a store's public profile. Every SELECT
 * below names its columns explicitly and never joins the merchants table
 * at all: there is no code path here that CAN leak taxId/iban/legalName,
 * by construction, not by remembering to omit a field.
 *
 * SQL injection discipline: every dynamic filter fragment is built with
 * Prisma.sql/Prisma.join, so every value (lat/lng, radius, category, diet
 * array, the ILIKE search term, page/pageSize) travels as a bound
 * parameter — never string-interpolated into the query text. Only the
 * WHERE clause's STRUCTURE (which conditions are present) varies with the
 * request; no raw string ever crosses from a request value into SQL text.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: DiscoveryCacheService,
  ) {}

  async searchOffers(
    query: DiscoveryOffersQueryDto,
  ): Promise<DiscoveryOffersResult> {
    const diet = parseDietFlags(query.diet);

    const cacheKey = buildDiscoveryOffersCacheKey({
      lat: query.lat,
      lng: query.lng,
      radiusM: query.radiusM,
      category: query.category,
      diet,
      pickupAfter: query.pickupAfter,
      pickupBefore: query.pickupBefore,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });

    const cached = await this.cache.get<DiscoveryOffersResult>(cacheKey);
    if (cached) return cached;

    const result = await this.queryOffers(query, diet);
    await this.cache.set(cacheKey, result, OFFERS_CACHE_TTL_SECONDS);
    return result;
  }

  private async queryOffers(
    query: DiscoveryOffersQueryDto,
    diet: DietFlag[] | undefined,
  ): Promise<DiscoveryOffersResult> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`d."status" = 'PUBLISHED'`,
      Prisma.sql`d."qtyReserved" < d."qtyTotal"`,
      Prisma.sql`d."pickupEndAt" > now()`,
      Prisma.sql`s."active" = true`,
      Prisma.sql`ST_DWithin(s."location", ${point}, ${query.radiusM})`,
    ];
    if (query.category) {
      conditions.push(
        Prisma.sql`bt."category" = ${query.category}::"BagCategory"`,
      );
    }
    if (diet && diet.length > 0) {
      conditions.push(
        Prisma.sql`bt."dietFlags" && ARRAY[${Prisma.join(diet)}]::"DietFlag"[]`,
      );
    }
    if (query.pickupAfter) {
      conditions.push(
        Prisma.sql`d."pickupStartAt" >= ${new Date(query.pickupAfter)}`,
      );
    }
    if (query.pickupBefore) {
      conditions.push(
        Prisma.sql`d."pickupEndAt" <= ${new Date(query.pickupBefore)}`,
      );
    }
    if (query.q) {
      conditions.push(Prisma.sql`bt."title" ILIKE ${`%${query.q}%`}`);
    }

    const whereClause = Prisma.join(conditions, " AND ");
    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.prisma.$queryRaw<
      Array<{
        offerId: string;
        storeId: string;
        storeName: string;
        district: string;
        distanceM: number;
        title: string;
        category: string;
        dietFlags: string[];
        priceCents: number;
        originalValueCentsMin: number;
        originalValueCentsMax: number;
        pickupStartAt: Date;
        pickupEndAt: Date;
        qtyLeft: number;
        coverImageUrl: string | null;
        totalCount: bigint;
      }>
    >(Prisma.sql`
      SELECT
        d."id" AS "offerId",
        s."id" AS "storeId",
        s."name" AS "storeName",
        s."district" AS "district",
        ST_Distance(s."location", ${point}) AS "distanceM",
        bt."title" AS "title",
        bt."category" AS "category",
        bt."dietFlags" AS "dietFlags",
        bt."priceCents" AS "priceCents",
        bt."originalValueCentsMin" AS "originalValueCentsMin",
        bt."originalValueCentsMax" AS "originalValueCentsMax",
        d."pickupStartAt" AS "pickupStartAt",
        d."pickupEndAt" AS "pickupEndAt",
        (d."qtyTotal" - d."qtyReserved") AS "qtyLeft",
        s."coverImageUrl" AS "coverImageUrl",
        COUNT(*) OVER() AS "totalCount"
      FROM "daily_offers" d
      JOIN "stores" s ON s."id" = d."storeId"
      JOIN "bag_templates" bt ON bt."id" = d."bagTemplateId"
      WHERE ${whereClause}
      ORDER BY ST_Distance(s."location", ${point}) ASC
      LIMIT ${query.pageSize} OFFSET ${offset}
    `);

    const items: DiscoveryOfferItem[] = rows.map((r) => ({
      offerId: r.offerId,
      store: {
        id: r.storeId,
        name: r.storeName,
        district: r.district,
        distanceM: Math.round(r.distanceM),
      },
      template: {
        title: r.title,
        category: r.category,
        dietFlags: r.dietFlags,
        priceCents: r.priceCents,
        originalValueCentsMin: r.originalValueCentsMin,
        originalValueCentsMax: r.originalValueCentsMax,
      },
      pickupStartAt: r.pickupStartAt,
      pickupEndAt: r.pickupEndAt,
      qtyLeft: r.qtyLeft,
      coverImageUrl: r.coverImageUrl,
    }));

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async map(query: DiscoveryMapQueryDto): Promise<DiscoveryMapPin[]> {
    if (query.west >= query.east || query.south >= query.north) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "DISCOVERY_BBOX_INVALID",
        message: "west must be < east and south must be < north.",
      });
    }
    const area = (query.east - query.west) * (query.north - query.south);
    if (area > MAX_BBOX_AREA_DEG2) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "DISCOVERY_BBOX_TOO_LARGE",
        message: `Bounding box area (${area.toFixed(2)} deg²) exceeds the ${MAX_BBOX_AREA_DEG2} deg² limit — zoom in and try again.`,
      });
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`d."status" = 'PUBLISHED'`,
      Prisma.sql`d."qtyReserved" < d."qtyTotal"`,
      Prisma.sql`d."pickupEndAt" > now()`,
      Prisma.sql`s."active" = true`,
      Prisma.sql`ST_Intersects(s."location"::geometry, ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326))`,
    ];
    if (query.category) {
      conditions.push(
        Prisma.sql`bt."category" = ${query.category}::"BagCategory"`,
      );
    }
    const whereClause = Prisma.join(conditions, " AND ");

    const rows = await this.prisma.$queryRaw<
      Array<{
        storeId: string;
        lat: number;
        lng: number;
        minPriceCents: number;
        offersCount: bigint;
      }>
    >(Prisma.sql`
      SELECT
        s."id" AS "storeId",
        s."latitude" AS "lat",
        s."longitude" AS "lng",
        MIN(bt."priceCents") AS "minPriceCents",
        COUNT(d."id") AS "offersCount"
      FROM "daily_offers" d
      JOIN "stores" s ON s."id" = d."storeId"
      JOIN "bag_templates" bt ON bt."id" = d."bagTemplateId"
      WHERE ${whereClause}
      GROUP BY s."id", s."latitude", s."longitude"
    `);

    return rows.map((r) => ({
      storeId: r.storeId,
      lat: r.lat,
      lng: r.lng,
      minPriceCents: r.minPriceCents,
      offersCount: Number(r.offersCount),
    }));
  }

  /**
   * Public store profile — @Public, so `active: true` is part of the
   * lookup itself (not a separate check after fetching): an inactive
   * store 404s exactly like a nonexistent one, matching the "deactivating
   * hides it from discovery" decision in stores.service.ts and avoiding
   * leaking "this store exists but is inactive" to an unauthenticated
   * caller.
   */
  async storeProfile(storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, active: true },
      select: {
        id: true,
        name: true,
        address: true,
        district: true,
        city: true,
        coverImageUrl: true,
        categoryTags: true,
        openingHoursJson: true,
      },
    });
    if (!store) throw storeNotFoundError();

    const now = new Date();
    const todayKey = istanbulDateKey(now);
    // qtyReserved < qtyTotal is a column-to-column comparison Prisma's
    // query builder can't express (same limitation OfferStockService's
    // raw-SQL claim/release documents) — filtered in application code
    // instead of raw SQL here since the result set is already scoped to
    // one store on one day (small, not a raw-SQL-worthy hot path).
    const rawOffers = await this.prisma.dailyOffer.findMany({
      where: {
        storeId,
        status: "PUBLISHED",
        offerDate: offerDateToDbDate(todayKey),
      },
      include: {
        bagTemplate: {
          select: {
            title: true,
            category: true,
            dietFlags: true,
            priceCents: true,
            originalValueCentsMin: true,
            originalValueCentsMax: true,
          },
        },
      },
      orderBy: { pickupStartAt: "asc" },
    });
    const todaysOffers = rawOffers
      .filter((o) => o.qtyReserved < o.qtyTotal && o.pickupEndAt > now)
      .map((o) => ({
        offerId: o.id,
        template: o.bagTemplate,
        pickupStartAt: o.pickupStartAt,
        pickupEndAt: o.pickupEndAt,
        qtyLeft: o.qtyTotal - o.qtyReserved,
      }));

    const ratingAgg = await this.prisma.rating.aggregate({
      where: { storeId, moderationStatus: "APPROVED" },
      _avg: { overallStars: true },
      _count: { _all: true },
    });

    return {
      store,
      todaysOffers,
      rating: {
        average: ratingAgg._avg.overallStars ?? 0,
        count: ratingAgg._count._all,
      },
    };
  }
}
