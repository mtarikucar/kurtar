import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PushProviderRegistry } from "../push-provider.registry";
import {
  PushMessage,
  PushProvider,
  PushSendOutcome,
  PushSendResult,
} from "../push-provider.interface";

/**
 * In-memory sandbox provider — records every send it's given so tests and
 * the manual curl verification sequence can assert on exactly who got
 * notified, without a real Expo round-trip. Never registers in production
 * (env.validation.ts already refuses to boot with PUSH_PROVIDER=mock
 * there; this onModuleInit guard is defense in depth, mirroring
 * MockPaymentProvider).
 */
@Injectable()
export class MockPushProvider implements PushProvider, OnModuleInit {
  readonly id = "mock" as const;
  private readonly logger = new Logger(MockPushProvider.name);
  private readonly sentLog: PushMessage[] = [];
  private readonly forcedOutcomes = new Map<string, PushSendOutcome>();

  constructor(private readonly registry: PushProviderRegistry) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== "production") {
      this.registry.register(this);
    }
  }

  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> {
    return messages.map((message) => {
      this.sentLog.push(message);
      const forced = this.forcedOutcomes.get(message.to);
      if (forced) {
        this.forcedOutcomes.delete(message.to); // one-shot, mirrors MockPaymentProvider's forceRefundFailure
        return {
          to: message.to,
          outcome: forced,
          error:
            forced === "ok"
              ? undefined
              : `Simulated ${forced} for ${message.to}`,
        };
      }
      return { to: message.to, outcome: "ok" as const };
    });
  }

  // ---- Test/dev-only helpers -------------------------------------------
  // Not part of PushProvider. Used by specs and the curl verification
  // sequence; never called from production code paths.

  getSentLog(): readonly PushMessage[] {
    return this.sentLog;
  }

  clearSentLog(): void {
    this.sentLog.length = 0;
  }

  /** Makes the NEXT sendBatch() call report `outcome` for this exact
   * token, one-shot. Used to exercise PushDispatchService's
   * disabledAt-on-token_invalid path without a real Expo call. */
  forceOutcomeFor(token: string, outcome: PushSendOutcome): void {
    this.forcedOutcomes.set(token, outcome);
  }
}
