import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationPolicyService } from "../notification-policy.service";
import { NotificationKind } from "../notification-policy.table";
import { PushFacadeService } from "./push-facade.service";

export interface PushMessageContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotifyUsersResult {
  /** Distinct candidate user ids considered, after dedup. */
  candidates: number;
  /** Denied by NotificationPolicy (opted out / quiet hours / inactive /
   * not found). */
  denied: number;
  /** Messages actually sent with outcome "ok". */
  sent: number;
}

/** Defense-in-depth cap on the live-token lookup. Every caller already
 * bounds its candidate-user-id list (offer.published.v1's fan-out limits;
 * a single-element array for confirm/redeem/reminder/cancel handlers), so
 * this is a belt-and-suspenders backstop, not the primary bound — it only
 * matters if a single user were to accumulate an unusually large number of
 * live devices (PushTokensService.register has no per-user cap). */
const MAX_TOKENS_PER_DISPATCH = 10_000;

/**
 * The shared "policy-check -> live-token-fetch -> send -> disable dead
 * tokens" pipeline every outbox handler that pushes reuses, so none of
 * them re-implement "never send to a disabledAt token" or "never send to
 * a BANNED/DELETED user" by hand. Handlers only ever supply WHO (candidate
 * user ids) and WHY (a NotificationKind) and WHAT (a per-user message
 * builder) — everything else (dedup, the NotificationPolicy gate, token
 * resolution, token-invalid handling) lives here exactly once.
 */
@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: PushFacadeService,
    private readonly policy: NotificationPolicyService,
  ) {}

  async notifyUsers(
    candidateUserIds: string[],
    kind: NotificationKind,
    buildMessage: (userId: string) => PushMessageContent,
  ): Promise<NotifyUsersResult> {
    const uniqueIds = [...new Set(candidateUserIds)];
    if (uniqueIds.length === 0) return { candidates: 0, denied: 0, sent: 0 };

    const allowedUserIds: string[] = [];
    for (const userId of uniqueIds) {
      const decision = await this.policy.mayNotify(userId, kind);
      if (decision.allowed) allowedUserIds.push(userId);
    }
    const denied = uniqueIds.length - allowedUserIds.length;
    if (allowedUserIds.length === 0) {
      return { candidates: uniqueIds.length, denied, sent: 0 };
    }

    // Never a disabledAt token (brief §2) — the filter is in the WHERE
    // clause, not a post-fetch check, so a disabled token is never even
    // considered.
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: allowedUserIds }, disabledAt: null },
      take: MAX_TOKENS_PER_DISPATCH,
    });
    if (tokens.length === 0) {
      return { candidates: uniqueIds.length, denied, sent: 0 };
    }

    const messages = tokens.map((token) => ({
      to: token.expoPushToken,
      ...buildMessage(token.userId),
    }));
    const results = await this.facade.sendBatch(messages);

    const invalidTokens = results
      .filter((r) => r.outcome === "token_invalid")
      .map((r) => r.to);
    if (invalidTokens.length > 0) {
      // Never delete — set disabledAt (brief §2's token lifecycle).
      await this.prisma.pushToken.updateMany({
        where: { expoPushToken: { in: invalidTokens } },
        data: { disabledAt: new Date() },
      });
      this.logger.log(
        `Disabled ${invalidTokens.length} push token(s) the provider reported unregistered`,
      );
    }

    const sent = results.filter((r) => r.outcome === "ok").length;
    return { candidates: uniqueIds.length, denied, sent };
  }
}
