import { BadRequestException } from "@nestjs/common";
import { istanbulDateKey } from "../../common/utils/istanbul-date.util";

const OFFER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface OfferWindowInput {
  offerDate: string; // YYYY-MM-DD, an Europe/Istanbul calendar date
  pickupStartAt: Date;
  pickupEndAt: Date;
}

/**
 * Validates POST /api/offers's pickup-window rules from the brief:
 *   - offerDate is a well-formed YYYY-MM-DD string
 *   - pickupStartAt < pickupEndAt
 *   - the window is entirely in the future (pickupStartAt > now)
 *   - both pickupStartAt and pickupEndAt fall on the SAME Europe/Istanbul
 *     calendar day as offerDate — deliberately NOT the UTC day, which can
 *     differ near midnight (Istanbul is UTC+3; e.g. 22:00 UTC on day D is
 *     already 01:00 Istanbul on day D+1).
 */
export function validateOfferWindow(
  input: OfferWindowInput,
  now: Date = new Date(),
): void {
  if (!OFFER_DATE_PATTERN.test(input.offerDate)) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "OFFER_DATE_INVALID",
      message: "offerDate must be a YYYY-MM-DD string.",
    });
  }
  if (input.pickupStartAt.getTime() >= input.pickupEndAt.getTime()) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "OFFER_WINDOW_START_NOT_BEFORE_END",
      message: "pickupStartAt must be before pickupEndAt.",
    });
  }
  if (input.pickupStartAt.getTime() <= now.getTime()) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "OFFER_WINDOW_NOT_FUTURE",
      message: "pickupStartAt must be in the future.",
    });
  }
  const startDay = istanbulDateKey(input.pickupStartAt);
  const endDay = istanbulDateKey(input.pickupEndAt);
  if (startDay !== input.offerDate || endDay !== input.offerDate) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "OFFER_WINDOW_NOT_SAME_DAY",
      message: `pickupStartAt/pickupEndAt must fall on offerDate (${input.offerDate}) in Europe/Istanbul local time (got ${startDay}..${endDay}).`,
    });
  }
}
