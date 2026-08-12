import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Store } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { validateStoreCoordinates } from "./store-geo.rules";

function storeNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "STORE_NOT_FOUND",
    message: "Store not found.",
  });
}

function notOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This store does not belong to you.",
  });
}

function merchantNotApprovedError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "MERCHANT_NOT_APPROVED",
    message: "Only an APPROVED merchant can create stores.",
  });
}

/**
 * Store CRUD, owner-scoped to the calling merchant (§2 of the brief).
 * Every write that touches latitude/longitude also sets the PostGIS
 * `location` geography column via raw SQL, in the SAME $transaction as
 * the Prisma write — latitude/longitude stay the source of truth for
 * display, `location` exists purely as discovery's spatial index column.
 *
 * Deactivating a store (`active: false`) hides it from every discovery
 * surface (modules/discovery filters `stores.active = true`) but does NOT
 * cancel its offers — a deliberate decision: a store might go inactive
 * for reasons unrelated to today's already-published offers (temporary
 * closure, reworking its profile), and force-cancelling live reservations
 * as a side effect of a visibility toggle would be surprising. A merchant
 * who wants offers cancelled uses POST /offers/:id/cancel explicitly.
 */
@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(merchantId: string, dto: CreateStoreDto): Promise<Store> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { verificationStatus: true },
    });
    if (!merchant) {
      throw new NotFoundException({
        statusCode: 404,
        errorCode: "MERCHANT_NOT_FOUND",
        message: "Merchant not found.",
      });
    }
    if (merchant.verificationStatus !== "APPROVED") {
      throw merchantNotApprovedError();
    }

    validateStoreCoordinates(dto.latitude, dto.longitude);

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          merchantId,
          name: dto.name,
          address: dto.address,
          district: dto.district,
          city: dto.city,
          latitude: dto.latitude,
          longitude: dto.longitude,
          coverImageUrl: dto.coverImageUrl,
          categoryTags: dto.categoryTags ?? [],
          // See UpdateStoreDto's update() call site for why this cast is
          // needed (Prisma's InputJsonValue vs. a generic Record type).
          openingHoursJson: dto.openingHoursJson as
            Prisma.InputJsonValue | undefined,
        },
      });
      await tx.$executeRaw`
        UPDATE "stores"
        SET "location" = ST_SetSRID(ST_MakePoint(${store.longitude}, ${store.latitude}), 4326)::geography
        WHERE "id" = ${store.id}
      `;
      return store;
    });
  }

  async list(merchantId: string): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(merchantId: string, id: string): Promise<Store> {
    return this.getOwned(merchantId, id);
  }

  private async getOwned(merchantId: string, id: string): Promise<Store> {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw storeNotFoundError();
    if (store.merchantId !== merchantId) throw notOwnerError();
    return store;
  }

  async update(
    merchantId: string,
    id: string,
    dto: UpdateStoreDto,
  ): Promise<Store> {
    await this.getOwned(merchantId, id);

    const hasLat = dto.latitude !== undefined;
    const hasLng = dto.longitude !== undefined;
    if (hasLat !== hasLng) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: "STORE_COORDINATES_INCOMPLETE",
        message: "Provide both latitude and longitude together, or neither.",
      });
    }
    const geoChanged = hasLat && hasLng;
    if (geoChanged) {
      validateStoreCoordinates(dto.latitude!, dto.longitude!);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.store.update({
        where: { id },
        data: {
          name: dto.name,
          address: dto.address,
          district: dto.district,
          city: dto.city,
          latitude: dto.latitude,
          longitude: dto.longitude,
          coverImageUrl: dto.coverImageUrl,
          categoryTags: dto.categoryTags,
          // dto.openingHoursJson is validated as a plain object by
          // @IsObject(); the cast is only needed because Prisma's
          // generated InputJsonValue type doesn't structurally match a
          // generic Record<string, unknown> even though every value
          // class-validator accepts here is JSON-serializable.
          openingHoursJson: dto.openingHoursJson as
            Prisma.InputJsonValue | undefined,
          active: dto.active,
        },
      });
      if (geoChanged) {
        await tx.$executeRaw`
          UPDATE "stores"
          SET "location" = ST_SetSRID(ST_MakePoint(${updated.longitude}, ${updated.latitude}), 4326)::geography
          WHERE "id" = ${updated.id}
        `;
      }
      return updated;
    });
  }
}
