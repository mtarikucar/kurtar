import { BadRequestException } from "@nestjs/common";
import { BAG_PRICE_FLOOR_CENTS } from "./offer.constants";

export interface BagTemplateEconomics {
  priceCents: number;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
}

/**
 * The three cross-field money rules a BagTemplate must satisfy, checked
 * together (not per-field DTO decorators, which can't express "compare
 * these two fields") on every create AND update. Each violation gets its
 * own explicit errorCode so a client can tell them apart instead of
 * parsing a message string.
 */
export function validateBagTemplateEconomics(
  params: BagTemplateEconomics,
): void {
  if (params.priceCents < BAG_PRICE_FLOOR_CENTS) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "BAG_PRICE_BELOW_FLOOR",
      message: `priceCents must be at least ${BAG_PRICE_FLOOR_CENTS} (₺${BAG_PRICE_FLOOR_CENTS / 100}).`,
    });
  }
  if (params.originalValueCentsMin > params.originalValueCentsMax) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "BAG_VALUE_BAND_INVALID",
      message: "originalValueCentsMin must be <= originalValueCentsMax.",
    });
  }
  if (params.priceCents >= params.originalValueCentsMin) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "BAG_PRICE_NOT_BELOW_VALUE",
      message:
        "priceCents must be less than originalValueCentsMin — a surprise bag must be cheaper than its content value.",
    });
  }
}
