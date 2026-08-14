import { BadRequestException } from "@nestjs/common";
import { isValidCoordinates } from "../../common/utils/geolocation.util";

/** Loose bounding box around mainland Turkey — a cheap sanity check
 * against typos/swapped fields, not a precise border. Exclusive bounds
 * per the brief: 25 < lng < 45, 35 < lat < 43. */
export const TURKEY_BBOX = { minLng: 25, maxLng: 45, minLat: 35, maxLat: 43 };

export function validateStoreCoordinates(
  latitude: number,
  longitude: number,
): void {
  if (!isValidCoordinates(latitude, longitude)) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "STORE_COORDINATES_INVALID",
      message: "latitude/longitude are not valid coordinates.",
    });
  }
  if (
    longitude <= TURKEY_BBOX.minLng ||
    longitude >= TURKEY_BBOX.maxLng ||
    latitude <= TURKEY_BBOX.minLat ||
    latitude >= TURKEY_BBOX.maxLat
  ) {
    throw new BadRequestException({
      statusCode: 400,
      errorCode: "STORE_LOCATION_OUTSIDE_TURKEY",
      message: `latitude/longitude must fall within Turkey's bounding box (${TURKEY_BBOX.minLat}<lat<${TURKEY_BBOX.maxLat}, ${TURKEY_BBOX.minLng}<lng<${TURKEY_BBOX.maxLng}).`,
    });
  }
}
