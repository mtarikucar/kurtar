import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, randomUUID } from "crypto";
import { PaymentProviderRegistry } from "../payment-provider.registry";
import {
  CreateIntentParams,
  CreateIntentResult,
  ParsedWebhookEvent,
  PaymentProvider,
  PayoutResult,
  ProviderPaymentStatus,
  QueryStatusResult,
  RefundResult,
} from "../payment-provider.interface";

const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

interface MockIntentState {
  amountCents: number;
  status: ProviderPaymentStatus;
  paidAmountCents?: number;
}

interface MockRefundLogEntry {
  merchantOid: string;
  amountCents: number;
  refundRef: string;
}

interface MockPayoutLogEntry {
  merchantRef: string;
  amountCents: number;
  ref: string;
  pspTransferRef: string;
}

/**
 * In-memory sandbox provider — the only PaymentProvider actually
 * implemented in Task 4. Never registers in production (env.validation.ts
 * already refuses to boot with PAYMENT_PROVIDER=mock there; this
 * onModuleInit guard is defense in depth, mirroring kds's
 * MockPaymentProvider and the SmsService mock-in-production posture).
 *
 * Unlike kds's mock (which auto-succeeds every intent instantly),
 * createIntent here leaves the intent "pending" — kurtar's flow is
 * webhook-driven (a reservation stays PENDING_PAYMENT until a webhook, or
 * the sweeper's poll, reports success), so an instant-succeed mock would
 * make that whole path untestable. State only moves to paid/failed via:
 *   - simulateWebhookDelivery() building a payload parseWebhook() accepts
 *     (what a curl / realdb spec fires at POST /api/webhooks/payment), or
 *   - setProviderSideStatus(), a direct test hook for the sweeper's poll
 *     path (queryStatus) independent of any webhook delivery.
 * Both update the same in-memory map so the two views never disagree.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider, OnModuleInit {
  readonly id = "mock" as const;
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly intents = new Map<string, MockIntentState>();
  private readonly refundLog: MockRefundLogEntry[] = [];
  private readonly webhookSecret: string;
  private readonly forcedRefundFailures = new Set<string>();
  // [Task 8] Keyed by `ref` (the caller's idempotency key — always a
  // SettlementBatch id in practice), NOT by merchantRef/amountCents — this
  // is what makes payout() idempotent: two calls with the same `ref`
  // return the SAME pspTransferRef and are recorded exactly once, however
  // many times they're invoked (settlements.service.ts deliberately calls
  // this OUTSIDE any DB lock, so two racing cron ticks CAN both reach this
  // method concurrently before either's own guarded UPDATE commits).
  private readonly payouts = new Map<string, MockPayoutLogEntry>();
  private readonly forcedPayoutFailures = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: PaymentProviderRegistry,
  ) {
    // No acceptable-to-run-without-this mode, mirroring JWT_SECRET
    // (strategies/jwt.strategy.ts) — the mock provider's whole
    // "verification" story is this shared secret; nothing meaningful
    // happens if it's blank.
    const secret = this.configService.get<string>("WEBHOOK_SECRET");
    if (!secret) {
      throw new Error(
        "WEBHOOK_SECRET is not configured (required by the mock payment provider to verify inbound webhook deliveries)",
      );
    }
    this.webhookSecret = secret;
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV !== "production") {
      this.registry.register(this);
    }
  }

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const existing = this.intents.get(params.merchantOid);
    if (existing) {
      // Idempotent replay — same merchantOid (kurtar mints one per
      // reservation, so this only fires on an actual retry) returns the
      // already-created intent rather than clobbering its state.
      return {
        providerRef: `mock-intent-${params.merchantOid}`,
        redirectUrl: `https://mock-payment.local/pay/${params.merchantOid}`,
      };
    }

    this.intents.set(params.merchantOid, {
      amountCents: params.amountCents,
      status: "pending",
    });

    return {
      providerRef: `mock-intent-${params.merchantOid}`,
      redirectUrl: `https://mock-payment.local/pay/${params.merchantOid}`,
    };
  }

  async queryStatus(merchantOid: string): Promise<QueryStatusResult> {
    const intent = this.intents.get(merchantOid);
    if (!intent) {
      throw new Error(`Mock intent not found: ${merchantOid}`);
    }
    return {
      status: intent.status,
      paidAmountCents: intent.paidAmountCents,
    };
  }

  async refund(
    merchantOid: string,
    amountCents: number,
  ): Promise<RefundResult> {
    if (this.forcedRefundFailures.delete(merchantOid)) {
      // [Task 5] One-shot failure injected by forceRefundFailure() below —
      // consumed on use, so a caller's retry (or a different
      // merchantOid in the same batch) succeeds normally. Mirrors a real
      // provider genuinely rejecting one refund call in a batch.
      throw new Error(`Simulated refund failure for ${merchantOid}`);
    }
    const intent = this.intents.get(merchantOid);
    if (!intent) {
      throw new Error(`Mock intent not found: ${merchantOid}`);
    }
    const refundRef = `mock-refund-${randomBytes(4).toString("hex")}`;
    this.refundLog.push({ merchantOid, amountCents, refundRef });
    return { refundRef };
  }

  /**
   * [Task 8] Idempotent by `ref` — see the `payouts` field's doc comment.
   * `forcePayoutFailure(ref)` is a one-shot test hook (consumed on use,
   * mirroring `forceRefundFailure`): the realdb spec proving "provider
   * failure -> batch stays APPROVED, retried next tick, exactly one
   * payout recorded on eventual success" forces the FIRST call for a
   * given `ref` to fail, then calls payout() again with the SAME ref to
   * simulate the next cron tick's retry.
   */
  async payout(
    merchantRef: string,
    amountCents: number,
    ref: string,
  ): Promise<PayoutResult> {
    const existing = this.payouts.get(ref);
    if (existing) {
      // [Fix round, C3] A repeated call for the same ref MUST carry the
      // same amount — the caller (settlement-payout.service.ts) is
      // supposed to guarantee this via SettlementBatch.payoutAttemptedAt
      // freezing netPayoutCents before ever reaching here; this assertion
      // is what makes a regression in that guarantee fail LOUD in tests
      // instead of silently returning a stale transfer ref for a batch
      // whose books now say something different.
      if (existing.amountCents !== amountCents) {
        throw new Error(
          `Payout amount mismatch for ref ${ref}: first attempt was ${existing.amountCents} kuruş, this call is ${amountCents} kuruş — the amount for a given payout ref must never change once attempted.`,
        );
      }
      return { pspTransferRef: existing.pspTransferRef };
    }
    if (this.forcedPayoutFailures.delete(ref)) {
      throw new Error(`Simulated payout failure for ref ${ref}`);
    }
    const pspTransferRef = `mock-payout-${randomBytes(4).toString("hex")}`;
    this.payouts.set(ref, { merchantRef, amountCents, ref, pspTransferRef });
    return { pspTransferRef };
  }

  async parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookEvent> {
    const provided = headers[WEBHOOK_SECRET_HEADER];
    const providedValue = Array.isArray(provided) ? provided[0] : provided;
    if (providedValue !== this.webhookSecret) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    const bodyText =
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    let payload: {
      merchantOid?: string;
      status?: string;
      totalCents?: number;
      eventId?: string;
    };
    try {
      payload = JSON.parse(bodyText || "{}");
    } catch {
      throw new UnauthorizedException("Malformed webhook payload");
    }

    if (
      !payload.merchantOid ||
      (payload.status !== "success" && payload.status !== "failed") ||
      typeof payload.totalCents !== "number" ||
      !payload.eventId
    ) {
      throw new UnauthorizedException(
        "Webhook payload missing merchantOid/status/totalCents/eventId",
      );
    }

    const event: ParsedWebhookEvent = {
      merchantOid: payload.merchantOid,
      status: payload.status,
      totalCents: payload.totalCents,
      externalEventId: payload.eventId,
    };

    // Keep the provider's own view (queryStatus) consistent with what a
    // webhook just reported, when we know about the intent at all —
    // mirrors a real provider settling its own internal state on charge
    // completion, independent of whether OUR settle service accepts the
    // amount it reports.
    const intent = this.intents.get(event.merchantOid);
    if (intent) {
      intent.status = event.status === "success" ? "paid" : "failed";
      if (event.status === "success") {
        intent.paidAmountCents = event.totalCents;
      }
    }

    return event;
  }

  async healthCheck() {
    return { ok: true, details: { mode: "mock", intents: this.intents.size } };
  }

  // ---- Test/dev-only helpers -------------------------------------------
  // Not part of PaymentProvider. Used by the realdb race specs and the
  // manual curl verification sequence to drive the mock without a real
  // gateway. Never called from production code paths.

  /** Build a {body, headers} pair that parseWebhook() will accept. */
  buildWebhookRequest(params: {
    merchantOid: string;
    status: "success" | "failed";
    totalCents: number;
    eventId?: string;
  }): { body: string; headers: Record<string, string> } {
    return {
      body: JSON.stringify({
        merchantOid: params.merchantOid,
        status: params.status,
        totalCents: params.totalCents,
        eventId: params.eventId ?? randomUUID(),
      }),
      headers: { [WEBHOOK_SECRET_HEADER]: this.webhookSecret },
    };
  }

  /**
   * Directly set what queryStatus() reports for a merchantOid, without
   * going through parseWebhook. Used by the sweeper-vs-webhook race spec
   * to make the provider-side view diverge from ours ahead of racing the
   * two settle paths.
   */
  setProviderSideStatus(
    merchantOid: string,
    status: ProviderPaymentStatus,
    paidAmountCents?: number,
  ): void {
    const intent = this.intents.get(merchantOid);
    if (!intent) {
      throw new Error(`Mock intent not found: ${merchantOid}`);
    }
    intent.status = status;
    intent.paidAmountCents = paidAmountCents;
  }

  getRefundLog(): readonly MockRefundLogEntry[] {
    return this.refundLog;
  }

  /**
   * [Task 5] Test-only: make the NEXT refund() call for this merchantOid
   * throw, simulating a provider-side refund failure — used by the
   * merchant-cancel-fan-out realdb spec's "one refund fails, the other
   * still gets recorded" case. One-shot (see refund()'s doc comment).
   */
  forceRefundFailure(merchantOid: string): void {
    this.forcedRefundFailures.add(merchantOid);
  }

  /** Test-only escape hatch for specs that need an intent to exist without going through createIntent(). */
  seedIntent(merchantOid: string, amountCents: number): void {
    this.intents.set(merchantOid, { amountCents, status: "pending" });
  }

  getPayoutLog(): readonly MockPayoutLogEntry[] {
    return Array.from(this.payouts.values());
  }

  /** [Task 8] Test-only: make the NEXT payout() call for this `ref` throw
   * once (see the `forcedPayoutFailures` field's doc comment). */
  forcePayoutFailure(ref: string): void {
    this.forcedPayoutFailures.add(ref);
  }
}
