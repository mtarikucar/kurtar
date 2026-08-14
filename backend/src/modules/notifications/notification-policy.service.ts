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
 *
 * [Fix round, Important 5] `mayNotifyBatch` is the primary implementation
 * — exactly TWO queries (`user.findMany` + `notificationPreference.findMany`)
 * regardless of how many userIds are checked, evaluating the (pure)
 * policy table in memory per user. The original shape checked one user at
 * a time (up to 2 sequential round-trips per user), which meant a 2000-
 * favoriter fan-out serialized up to 4000 DB round-trips inside one 15s
 * cron tick. `mayNotify` (single user) is now a thin wrapper over the
 * batch method — kept because it's a clean call shape for the
 * single-recipient handlers (confirm/redeem/reminder) and because
 * rewriting every existing caller to always build a one-element array
 * would be needless churn.
 */
@Injectable()
export class NotificationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async mayNotify(
    userId: string,
    kind: NotificationKind,
    now: Date = new Date(),
  ): Promise<NotificationPolicyDecision> {
    const decisions = await this.mayNotifyBatch([userId], kind, now);
    return decisions.get(userId)!;
  }

  async mayNotifyBatch(
    userIds: string[],
    kind: NotificationKind,
    now: Date = new Date(),
  ): Promise<Map<string, NotificationPolicyDecision>> {
    const decisions = new Map<string, NotificationPolicyDecision>();
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return decisions;

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    for (const id of uniqueIds) {
      if (!userById.has(id)) {
        decisions.set(id, { allowed: false, reason: "USER_NOT_FOUND" });
      }
    }

    const rule = NOTIFICATION_POLICY_TABLE[kind];
    const nonTransactionalCandidates: string[] = [];
    for (const user of users) {
      if (user.status !== "ACTIVE") {
        decisions.set(user.id, { allowed: false, reason: "USER_NOT_ACTIVE" });
      } else if (rule.transactional) {
        decisions.set(user.id, { allowed: true });
      } else {
        nonTransactionalCandidates.push(user.id);
      }
    }

    if (nonTransactionalCandidates.length === 0) return decisions;

    const prefsRows = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: nonTransactionalCandidates } },
      select: {
        userId: true,
        favoritesEnabled: true,
        nearbyEnabled: true,
        marketingEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });
    const prefsByUser = new Map(prefsRows.map((p) => [p.userId, p]));

    for (const userId of nonTransactionalCandidates) {
      const prefs = prefsByUser.get(userId) ?? DEFAULT_PREFERENCES;

      if (rule.preferenceField && !prefs[rule.preferenceField]) {
        decisions.set(userId, {
          allowed: false,
          reason: "PREFERENCE_DISABLED",
        });
        continue;
      }
      if (isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, now)) {
        decisions.set(userId, { allowed: false, reason: "QUIET_HOURS" });
        continue;
      }
      decisions.set(userId, { allowed: true });
    }

    return decisions;
  }
}
