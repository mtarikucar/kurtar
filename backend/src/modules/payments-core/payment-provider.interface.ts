import { ValidPaymentProvider } from "../../config/env.validation";

/**
 * Provider-neutral payment seam for kurtar. Trimmed down from kds's
 * backend/src/modules/payments-core/payment-provider.interface.ts to
 * exactly what reservations/webhooks/the sweeper need — no card-present
 * terminals, no settlement reports, no multi-mode dispatch (kds carries
 * those for POS hardware kurtar doesn't have).
 *
 * Every provider (mock today; iyzico/paytr later) implements this so
 * business code never imports a vendor SDK directly.
 */

export type ProviderPaymentStatus = "pending" | "paid" | "failed";

export interface CreateIntentParams {
  /** The Payment row's merchantOid — the provider-facing order reference. */
  merchantOid: string;
  amountCents: number;
  /** Caller-side dedup key. Same key -> same intent, never a double charge. */
  idempotencyKey: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  /** Where to send the buyer after they finish paying (3DS redirect etc). */
  returnUrl?: string;
}

export interface CreateIntentResult {
  /** Provider's own reference for this intent (kds's `intentId`). */
  providerRef: string;
  /** Present for redirect-based flows (hosted checkout page, 3DS). */
  redirectUrl?: string;
}

export interface QueryStatusResult {
  status: ProviderPaymentStatus;
  /** Only meaningful when status === "paid". */
  paidAmountCents?: number;
}

export interface RefundResult {
  refundRef: string;
}

/**
 * [Task 8] A merchant payout (settlement batch payment) call. `ref` is the
 * caller's idempotency key — settlements.service.ts always passes the
 * SettlementBatch id, so calling payout() twice for the same batch (e.g. a
 * second cron tick after the first's response was lost, or two concurrent
 * ticks both reaching this call before either's DB write commits) MUST
 * return the SAME pspTransferRef rather than moving money twice. Every
 * adapter implementing this interface is responsible for that guarantee —
 * see MockPaymentProvider.payout()'s in-memory ledger for the reference
 * implementation.
 */
export interface PayoutResult {
  pspTransferRef: string;
}

/**
 * The result of verifying + parsing an inbound webhook delivery. Producing
 * one of these IS the verification step — a provider whose signature check
 * fails must throw rather than return, so a forged callback never reaches
 * the settle service.
 */
export interface ParsedWebhookEvent {
  merchantOid: string;
  status: "success" | "failed";
  totalCents: number;
  /** Provider's own event id — the WebhookEventLog dedup key. */
  externalEventId: string;
}

export interface PaymentProvider {
  readonly id: ValidPaymentProvider;

  /** Idempotent: same idempotencyKey -> same intent returned, never a double charge. */
  createIntent(params: CreateIntentParams): Promise<CreateIntentResult>;

  queryStatus(merchantOid: string): Promise<QueryStatusResult>;

  refund(merchantOid: string, amountCents: number): Promise<RefundResult>;

  /**
   * [Task 8] Pay a merchant out for a settlement batch. `merchantRef` is
   * the destination account reference (the merchant's IBAN, or a PSP sub-
   * merchant key once onboarding assigns one — provider-specific which it
   * actually uses); `ref` is the idempotency key (see PayoutResult's doc
   * comment). Idempotent: same `ref` -> the same PayoutResult, never a
   * second transfer.
   */
  payout(
    merchantRef: string,
    amountCents: number,
    ref: string,
  ): Promise<PayoutResult>;

  /**
   * Verify the inbound webhook's authenticity (signature / shared secret /
   * HMAC — provider-specific) and return the normalized event. MUST throw
   * on a failed verification; callers never see an event object for a
   * request that didn't verify.
   */
  parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookEvent>;

  healthCheck(): Promise<{ ok: boolean; details?: Record<string, unknown> }>;
}
