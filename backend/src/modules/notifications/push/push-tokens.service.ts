import { Injectable } from "@nestjs/common";
import { Platform } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

/**
 * PushToken lifecycle (brief §2) — register/update via upsert-on-token,
 * remove via a user-scoped delete. Never a plain delete for "this token
 * failed to deliver": that's the outbox worker/PushDispatchService's job
 * (disabledAt, never a row delete — see that file's doc comment).
 */
@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert on expoPushToken (its own DB unique constraint) — a token
   * re-registered by a different user (device re-login, shared device)
   * is simply reassigned to that user, matching how a device's current
   * owner is always whoever most recently registered it. */
  async register(
    userId: string,
    expoPushToken: string,
    platform: Platform,
  ): Promise<{ ok: true }> {
    const now = new Date();
    await this.prisma.pushToken.upsert({
      where: { expoPushToken },
      update: { userId, platform, lastSeenAt: now, disabledAt: null },
      create: { userId, expoPushToken, platform, lastSeenAt: now },
    });
    return { ok: true };
  }

  /** Scoped to the caller's own userId — deleting someone else's token by
   * guessing its value is a silent no-op, not a 403/404 that would
   * confirm the token's existence to a caller who doesn't own it. */
  async remove(
    userId: string,
    expoPushToken: string,
  ): Promise<{ deleted: boolean }> {
    const result = await this.prisma.pushToken.deleteMany({
      where: { expoPushToken, userId },
    });
    return { deleted: result.count > 0 };
  }
}
