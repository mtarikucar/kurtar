import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BagTemplate } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { validateBagTemplateEconomics } from "./bag-template.rules";
import { CreateBagTemplateDto } from "./dto/create-bag-template.dto";
import { UpdateBagTemplateDto } from "./dto/update-bag-template.dto";

function templateNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "BAG_TEMPLATE_NOT_FOUND",
    message: "Bag template not found.",
  });
}

function storeNotFoundError() {
  return new NotFoundException({
    statusCode: 404,
    errorCode: "STORE_NOT_FOUND",
    message: "Store not found.",
  });
}

function notStoreOwnerError() {
  return new ForbiddenException({
    statusCode: 403,
    errorCode: "FORBIDDEN",
    message: "This store does not belong to you.",
  });
}

/** BagTemplate CRUD — store-owner-scoped (§3 of the brief). Money rules
 * (price floor, value band, price-below-value) are enforced by
 * bag-template.rules.ts's validateBagTemplateEconomics on every create AND
 * update, never just on create. */
@Injectable()
export class BagTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwned(
    merchantId: string,
    id: string,
  ): Promise<BagTemplate & { store: { merchantId: string } }> {
    const template = await this.prisma.bagTemplate.findUnique({
      where: { id },
      include: { store: { select: { merchantId: true } } },
    });
    if (!template) throw templateNotFoundError();
    if (template.store.merchantId !== merchantId) throw notStoreOwnerError();
    return template;
  }

  async create(merchantId: string, dto: CreateBagTemplateDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
    });
    if (!store) throw storeNotFoundError();
    if (store.merchantId !== merchantId) throw notStoreOwnerError();

    validateBagTemplateEconomics({
      priceCents: dto.priceCents,
      originalValueCentsMin: dto.originalValueCentsMin,
      originalValueCentsMax: dto.originalValueCentsMax,
    });

    return this.prisma.bagTemplate.create({
      data: {
        storeId: dto.storeId,
        title: dto.title,
        category: dto.category,
        dietFlags: dto.dietFlags ?? [],
        allergenDisclaimer: dto.allergenDisclaimer,
        originalValueCentsMin: dto.originalValueCentsMin,
        originalValueCentsMax: dto.originalValueCentsMax,
        priceCents: dto.priceCents,
        description: dto.description,
      },
    });
  }

  async list(merchantId: string, storeId?: string) {
    return this.prisma.bagTemplate.findMany({
      where: { store: { merchantId }, ...(storeId ? { storeId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(merchantId: string, id: string) {
    return this.getOwned(merchantId, id);
  }

  async update(merchantId: string, id: string, dto: UpdateBagTemplateDto) {
    const existing = await this.getOwned(merchantId, id);

    // Re-validate the FULL economics (existing values merged with
    // whatever this update touches) — never just the changed field in
    // isolation, since "price < value min" is a relationship between
    // fields that can each look fine individually.
    validateBagTemplateEconomics({
      priceCents: dto.priceCents ?? existing.priceCents,
      originalValueCentsMin:
        dto.originalValueCentsMin ?? existing.originalValueCentsMin,
      originalValueCentsMax:
        dto.originalValueCentsMax ?? existing.originalValueCentsMax,
    });

    return this.prisma.bagTemplate.update({
      where: { id },
      data: {
        title: dto.title,
        category: dto.category,
        dietFlags: dto.dietFlags,
        allergenDisclaimer: dto.allergenDisclaimer,
        originalValueCentsMin: dto.originalValueCentsMin,
        originalValueCentsMax: dto.originalValueCentsMax,
        priceCents: dto.priceCents,
        description: dto.description,
        active: dto.active,
      },
    });
  }

  /** Soft-delete: BagTemplate rows can never be hard-deleted once a
   * DailyOffer references them (onDelete: Restrict) — active:false is the
   * only "delete" this schema supports, same pattern as Store.active. */
  async deactivate(merchantId: string, id: string) {
    await this.getOwned(merchantId, id);
    return this.prisma.bagTemplate.update({
      where: { id },
      data: { active: false },
    });
  }
}
