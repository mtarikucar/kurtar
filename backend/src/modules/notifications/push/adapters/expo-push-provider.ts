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
import { redactPushTokens } from "../../../../common/helpers/pii-mask.helper";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** [Fix round 2, leg (b)] Per-chunk fetch timeout — `fetch()` has NO
 * default timeout at all; without one, a single hung TCP connection to
 * Expo could keep a chunk (and therefore the whole `sendBatch` call, and
 * therefore the outbox handler invoking it) pending indefinitely. 15s is
 * comfortably longer than a healthy Expo response but short enough that a
 * genuinely stuck chunk fails fast and moves on. */
const EXPO_FETCH_TIMEOUT_MS = 15_000;

/** [Fix round 2, leg (b)] How many chunks are in flight at once. Sequential
 * chunking (the original design) meant `sendBatch`'s total wall-clock time
 * scaled linearly with candidate count — at the widened Important-4
 * fan-out ceiling (10,000 candidates / 100 per chunk = 100 chunks), a
 * fully-sequential worst case (every chunk timing out) would take
 * 100 * EXPO_FETCH_TIMEOUT_MS = 25 minutes, itself threatening
 * OutboxWorkerService's 5-minute lease regardless of the per-event
 * lease-renewal fix. Bounded concurrency caps the worst case at
 * ceil(chunks / EXPO_CHUNK_CONCURRENCY) * EXPO_FETCH_TIMEOUT_MS — at this
 * concurrency, ~2.5 minutes for the pathological all-100-chunks-timeout
 * case, comfortably under the lease. */
const EXPO_CHUNK_CONCURRENCY = 10;

/**
 * Real Expo Push adapter — chunks `sendBatch` into <=100-message requests
 * (Expo's documented per-request limit; see expo-push.util.ts), sent with
 * bounded concurrency (EXPO_CHUNK_CONCURRENCY) and a per-chunk fetch
 * timeout (EXPO_FETCH_TIMEOUT_MS), and classifies each response ticket
 * (expo-push.util.ts's classifyExpoTicket) back into a PushSendResult, in
 * the same order the messages were sent — chunk order is preserved
 * regardless of which chunk's HTTP call happens to resolve first, since
 * results are written into a fixed-index array by chunk position, not
 * appended in completion order.
 *
 * `EXPO_ACCESS_TOKEN` is optional — Expo's push endpoint accepts anonymous
 * requests for most setups; when set, it's sent as a Bearer token (Expo's
 * enhanced-security mode). Node 20's global `fetch` is used directly (no
 * HTTP client dependency needed).
 *
 * A whole-chunk failure (network error, timeout, non-2xx, malformed/
 * mismatched response) never throws — every message in that chunk gets
 * outcome "error" so the caller (PushDispatchService / the outbox worker)
 * can still process the rest of the batch and, for the worker's case,
 * retry the owning event with backoff rather than losing the whole
 * dispatch to one exception.
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
    const chunks = chunkMessages(messages);
    const resultsByChunk: PushSendResult[][] = new Array(chunks.length);
    let nextChunkIndex = 0;

    const runWorker = async (): Promise<void> => {
      while (nextChunkIndex < chunks.length) {
        // Synchronous read-then-increment (no `await` in between) — safe
        // under Node's single-threaded event loop even with multiple
        // concurrent `runWorker` calls in flight.
        const index = nextChunkIndex++;
        resultsByChunk[index] = await this.sendChunk(chunks[index]);
      }
    };

    const workerCount = Math.min(EXPO_CHUNK_CONCURRENCY, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return resultsByChunk.flat();
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
        // [Fix round 2, leg (b)] AbortSignal.timeout is a Node 18+ global
        // (this repo requires Node >=20) — no extra dependency needed. A
        // timeout surfaces here as a rejected fetch (an AbortError), which
        // the catch block below already treats like any other network
        // failure: every message in the chunk gets outcome "error".
        signal: AbortSignal.timeout(EXPO_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Expo push send failed (network error or timeout): ${message}`,
      );
      return asError(message);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // [Fix round 1, cheap minor] Expo's error body echoes the request
      // back, including every recipient's push token — never log it
      // verbatim, same masking discipline as maskPhone/maskEmail.
      this.logger.error(
        `Expo push send failed (HTTP ${response.status}): ${redactPushTokens(text)}`,
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
