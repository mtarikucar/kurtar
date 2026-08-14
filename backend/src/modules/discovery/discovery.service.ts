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
import { escapeLikePattern } from "./like-escape.util";
import { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";
import { DiscoveryOffersQueryDto } from "./dto/discovery-offers-query.dto";

const OFFERS_CACHE_TTL_SECONDS = 45;
// "reject boxes larger than ~1 degree²" per the brief.
const MAX_BBOX_AREA_DEG2 = 1;
// Per-side span cap, IN ADDITION TO the area cap above — area alone lets a
// degenerate strip through (e.g. 0.001° east-west × 180° north-south is
// under 1 deg² by area but spans nearly every latitude on Earth). Bounding
// each side independently closes that regardless of the other side's
// extent. ~1.5° is comfortably wider than any single legitimate map
// viewport (roughly 165km at the equator) while still rejecting a
// pole-to-pole or round-the-globe sliver.
const MAX_BBOX_SPAN_DEG = 1.5;
// Hard cap on rows the map() query can ever return, independent of bbox
// size — a legitimately-sized-but-dense box (a packed city center) could
// still return an unbounded number of store pins otherwise, on a @Public,
// uncached endpoint.
const MAP_PINS_LIMIT = 500;

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
  // ISO strings, not Date — deliberately. A cache HIT round-trips through
  // JSON.stringify/JSON.parse (discovery-cache.service.ts), which turns a
  // Date into a string on write but never revives it back into a Date on
  // read; a cache MISS previously kept real Date objects straight from
  // $queryRaw. That meant the SAME field was a Date on a cache miss and a
  // string (mistyped as Date) on a cache hit — a type that lied depending
  // on cache state. Converting explicitly at the DB-read boundary (see
  // queryOffers below) makes cache-hit and cache-miss produce identically
  // shaped, honestly-typed objects; the HTTP response was always going to
  // serialize to a string either way.
  pickupStartAt: string;
  pickupEndAt: string;
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
 * search, a map-pin bbox query, and a store's public profile. The offers
 * and map queries JOIN "merchants" (needed to filter out anything but an
 * APPROVED merchant — see the `m."verificationStatus"` condition below,
 * added after a review found a SUSPENDED merchant's already-published
 * offers stayed visible/bookable indefinitely) but every SELECT list is
 * still hand-picked and never includes a single merchant column: there is
 * no code path here that CAN leak taxId/iban/legalName, by construction,
 * not by remembering to omit a field.
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
      Prisma.sql`bt."active" = true`,
      // A SUSPENDED (or never-APPROVED) merchant's offers must never
      // surface publicly — the suspend kill-switch cancels every ACTIVE
      // offer at the moment of suspension, but that's a one-shot sweep,
      // not a standing gate: without this filter, an offer published
      // BEFORE suspension (or one somehow created after via a missed
      // write-path check) would stay visible and bookable indefinitely.
      Prisma.sql`m."verificationStatus" = 'APPROVED'`,
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
      // escapeLikePattern neutralizes %/_ as ILIKE wildcards in the
      // user's search term (see like-escape.util.ts) — the value itself
      // is still a bound parameter either way (Prisma.sql), this is about
      // LIKE PATTERN semantics, not SQL injection. ESCAPE '\' is fixed
      // SQL text (not derived from the request), so it's safe to inline.
      const escaped = escapeLikePattern(query.q);
      conditions.push(
        Prisma.sql`bt."title" ILIKE ${`%${escaped}%`} ESCAPE '\\'`,
      );
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
      JOIN "merchants" m ON m."id" = s."merchantId"
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
      pickupStartAt: r.pickupStartAt.toISOString(),
      pickupEndAt: r.pickupEndAt.toISOString(),
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
    const width = query.east - query.west;
    const height = query.north - query.south;
    // Per-side span check FIRST, and independent of the area check below —
    // a degenerate strip (very narrow one way, very tall/wide the other)
    // can have a small AREA while still spanning an enormous range on one
    // axis. See MAX_BBOX_SPAN_DEG's doc comment.
    if (width > MAX_BBOX_SPAN_DEG || height > MAX_BBOX_SPAN_DEG) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "DISCOVERY_BBOX_TOO_LARGE",
        message: `Bounding box span (width ${width.toFixed(2)}°, height ${height.toFixed(2)}°) exceeds the ${MAX_BBOX_SPAN_DEG}° per-side limit — zoom in and try again.`,
      });
    }
    const area = width * height;
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
      Prisma.sql`bt."active" = true`,
      // Same reasoning as queryOffers above — a SUSPENDED merchant's pins
      // must not show up on the map either.
      Prisma.sql`m."verificationStatus" = 'APPROVED'`,
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
      JOIN "merchants" m ON m."id" = s."merchantId"
      WHERE ${whereClause}
      GROUP BY s."id", s."latitude", s."longitude"
      ORDER BY s."id"
      LIMIT ${MAP_PINS_LIMIT}
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
   * Public store profile — @Public, so `active: true` AND the owning
   * merchant's `verificationStatus: 'APPROVED'` are both part of the
   * lookup itself (not a separate check after fetching): an inactive
   * store, or a store whose merchant is DRAFT/SUSPENDED/etc., 404s exactly
   * like a nonexistent one — matching the "deactivating hides it from
   * discovery" decision in stores.service.ts (extended, after a review
   * finding, to "a non-APPROVED merchant's stores are hidden too") and
   * avoiding leaking "this store exists but is inactive/unapproved" to an
   * unauthenticated caller.
   */
  async storeProfile(storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        active: true,
        merchant: { verificationStatus: "APPROVED" },
      },
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
    // one store on one day (small, not a raw-SQL-worthy hot path). The
    // store-level query above already guarantees an APPROVED merchant, so
    // only bagTemplate.active needs its own filter here.
    const rawOffers = await this.prisma.dailyOffer.findMany({
      where: {
        storeId,
        status: "PUBLISHED",
        offerDate: offerDateToDbDate(todayKey),
        bagTemplate: { active: true },
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
