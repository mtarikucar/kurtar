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
    const intent = this.intents.get(merchantOid);
    if (!intent) {
      throw new Error(`Mock intent not found: ${merchantOid}`);
    }
    const refundRef = `mock-refund-${randomBytes(4).toString("hex")}`;
    this.refundLog.push({ merchantOid, amountCents, refundRef });
    return { refundRef };
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

  /** Test-only escape hatch for specs that need an intent to exist without going through createIntent(). */
  seedIntent(merchantOid: string, amountCents: number): void {
    this.intents.set(merchantOid, { amountCents, status: "pending" });
  }
}
