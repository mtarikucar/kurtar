import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PushProviderRegistry } from "../push-provider.registry";
import {
  PushMessage,
  PushProvider,
  PushSendResult,
} from "../push-provider.interface";
import {
  chunkMessages,
  classifyExpoTicket,
  ExpoPushTicket,
  toExpoRequestBody,
} from "./expo-push.util";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Real Expo Push adapter — chunks `sendBatch` into <=100-message requests
 * (Expo's documented per-request limit; see expo-push.util.ts) and
 * classifies each response ticket (expo-push.util.ts's classifyExpoTicket)
 * back into a PushSendResult, in the same order the messages were sent.
 *
 * `EXPO_ACCESS_TOKEN` is optional — Expo's push endpoint accepts anonymous
 * requests for most setups; when set, it's sent as a Bearer token (Expo's
 * enhanced-security mode). Node 20's global `fetch` is used directly (no
 * HTTP client dependency needed).
 *
 * A whole-chunk failure (network error, non-2xx, malformed/mismatched
 * response) never throws — every message in that chunk gets outcome
 * "error" so the caller (PushDispatchService / the outbox worker) can
 * still process the rest of the batch and, for the worker's case, retry
 * the owning event with backoff rather than losing the whole dispatch to
 * one exception.
 */
@Injectable()
export class ExpoPushProvider implements PushProvider, OnModuleInit {
  readonly id = "expo" as const;
  private readonly logger = new Logger(ExpoPushProvider.name);
  private readonly accessToken?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: PushProviderRegistry,
  ) {
    this.accessToken =
      this.configService.get<string>("EXPO_ACCESS_TOKEN") || undefined;
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> {
    const results: PushSendResult[] = [];
    for (const chunk of chunkMessages(messages)) {
      results.push(...(await this.sendChunk(chunk)));
    }
    return results;
  }

  private async sendChunk(messages: PushMessage[]): Promise<PushSendResult[]> {
    const asError = (error: string): PushSendResult[] =>
      messages.map((m) => ({ to: m.to, outcome: "error" as const, error }));

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          ...(this.accessToken
            ? { authorization: `Bearer ${this.accessToken}` }
            : {}),
        },
        body: JSON.stringify(toExpoRequestBody(messages)),
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Expo push send failed (network error): ${message}`);
      return asError(message);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error(
        `Expo push send failed (HTTP ${response.status}): ${text}`,
      );
      return asError(`HTTP ${response.status}`);
    }

    let json: { data?: ExpoPushTicket[] };
    try {
      json = await response.json();
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Expo push response was not valid JSON: ${message}`);
      return asError("Invalid JSON response");
    }

    const tickets = json.data ?? [];
    if (tickets.length !== messages.length) {
      this.logger.error(
        `Expo push response ticket count (${tickets.length}) != message count (${messages.length}) — treating every message in this chunk as errored`,
      );
      return asError("Ticket/message count mismatch");
    }

    return messages.map((m, i) => classifyExpoTicket(m.to, tickets[i]));
  }
}
