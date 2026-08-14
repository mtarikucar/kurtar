import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  NOTIFICATION_POLICY_TABLE,
  NotificationKind,
} from "./notification-policy.table";
import { isWithinQuietHours } from "./quiet-hours.util";

/** Mirrors NotificationPreference's own schema.prisma @default values —
 * applied in memory for a user who has never read/patched their
 * preferences (no row exists yet), WITHOUT creating one. Row creation is
 * reserved for the user's own explicit GET/PATCH
 * (NotificationPreferencesService.getOrCreate) — a bulk fan-out deciding
 * whether to notify hundreds of candidates must never have the side
 * effect of materializing a preferences row for every one of them. */
const DEFAULT_PREFERENCES = {
  favoritesEnabled: true,
  nearbyEnabled: false,
  marketingEnabled: false,
  quietHoursStart: null as number | null,
  quietHoursEnd: null as number | null,
};

export type NotificationDenyReason =
  "USER_NOT_FOUND" | "USER_NOT_ACTIVE" | "PREFERENCE_DISABLED" | "QUIET_HOURS";

export type NotificationPolicyDecision =
  { allowed: true } | { allowed: false; reason: NotificationDenyReason };

/**
 * "May we send X to user Y now?" — the single gate every push fan-out
 * goes through (PushDispatchService), covering:
 *   1. user status (never BANNED/DELETED, regardless of kind)
 *   2. transactional bypass (NOTIFICATION_POLICY_TABLE)
 *   3. the matching preference toggle, for non-transactional kinds
 *   4. quiet hours (Europe/Istanbul), for non-transactional kinds
 *
 * Token-level status (PushToken.disabledAt) is deliberately NOT this
 * service's concern — that's a property of a specific device/token, not
 * of the user+kind decision this makes; PushDispatchService filters
 * disabled tokens separately when it resolves allowed users to actual
 * send targets.
 */
@Injectable()
export class NotificationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async mayNotify(
    userId: string,
    kind: NotificationKind,
    now: Date = new Date(),
  ): Promise<NotificationPolicyDecision> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user) return { allowed: false, reason: "USER_NOT_FOUND" };
    if (user.status !== "ACTIVE") {
      return { allowed: false, reason: "USER_NOT_ACTIVE" };
    }

    const rule = NOTIFICATION_POLICY_TABLE[kind];
    if (rule.transactional) return { allowed: true };

    const prefsRow = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        favoritesEnabled: true,
        nearbyEnabled: true,
        marketingEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    const prefs = prefsRow ?? DEFAULT_PREFERENCES;

    if (rule.preferenceField && !prefs[rule.preferenceField]) {
      return { allowed: false, reason: "PREFERENCE_DISABLED" };
    }

    if (isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, now)) {
      return { allowed: false, reason: "QUIET_HOURS" };
    }

    return { allowed: true };
  }
}
