import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Writes the consumer's last known device location (brief §5) — powers
 * offer.published.v1's nearby-radius fan-out
 * (modules/outbox/handlers/offer-published.handler.ts's ST_DWithin query
 * against User.lastLat/lastLng). No history is kept — this is a single
 * "as of right now" triple, overwritten on every call.
 */
@Injectable()
export class UserLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    userId: string,
    lat: number,
    lng: number,
  ): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
    });
    return { ok: true };
  }
}
