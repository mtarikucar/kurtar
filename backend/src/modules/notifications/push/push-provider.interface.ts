import { ValidPushProvider } from "../../../config/env.validation";

/**
 * Provider-neutral push seam, mirroring
 * modules/payments-core/payment-provider.interface.ts's shape: a single
 * `sendBatch` entry point every adapter (mock today; Expo) implements, so
 * business code (PushDispatchService, the outbox handlers) never imports a
 * vendor SDK/HTTP client directly.
 */

export interface PushMessage {
  /** The recipient device's Expo push token (PushToken.expoPushToken). */
  to: string;
  title: string;
  body: string;
  /** Deep-link payload, e.g. {offerId, storeId} — delivered verbatim to
   * the client app's notification-tap handler. */
  data?: Record<string, unknown>;
}

export type PushSendOutcome = "ok" | "token_invalid" | "error";

export interface PushSendResult {
  to: string;
  outcome: PushSendOutcome;
  error?: string;
}

export interface PushProvider {
  readonly id: ValidPushProvider;

  /** Never throws for a per-message failure — every message in `messages`
   * gets exactly one result, in the same order, classifying the outcome
   * (`token_invalid` for a permanently-dead token, which the caller uses
   * to set PushToken.disabledAt — see PushDispatchService). May reject the
   * whole call for a transport-level failure (network error, non-2xx from
   * the provider) that isn't attributable to any single message. */
  sendBatch(messages: PushMessage[]): Promise<PushSendResult[]>;
}
