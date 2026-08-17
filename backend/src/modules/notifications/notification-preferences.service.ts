import { Injectable } from "@nestjs/common";
import { NotificationPreference } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";

/**
 * GET/PATCH /api/me/notification-preferences (brief §4) — create-on-first-
 * read with schema defaults. Distinct from NotificationPolicyService's OWN
 * default handling (which deliberately does NOT create a row — see that
 * file's doc comment): THIS service backs the user's own explicit
 * GET/PATCH of their own preferences, where materializing the row on
 * first touch is exactly the right, expected behavior — a single row per
 * real API caller, never one per bulk-fan-out candidate.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<NotificationPreference> {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    try {
      return await this.prisma.notificationPreference.create({
        data: { userId },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err, "userId")) {
        // Lost a race to a concurrent first-read/write for the same user —
        // the winner's row is exactly as valid as ours would have been.
        return this.prisma.notificationPreference.findUniqueOrThrow({
          where: { userId },
        });
      }
      throw err;
    }
  }

  async update(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    await this.getOrCreate(userId);
    return this.prisma.notificationPreference.update({
      where: { userId },
      data: dto,
    });
  }
}
