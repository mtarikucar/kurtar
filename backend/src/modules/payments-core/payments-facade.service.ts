import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import {
  CreateIntentParams,
  CreateIntentResult,
  ParsedWebhookEvent,
  PaymentProvider,
  PayoutResult,
  QueryStatusResult,
  RefundResult,
} from "./payment-provider.interface";
import { ValidPaymentProvider } from "../../config/env.validation";

/**
 * Provider-neutral façade. Business code (reservations, the webhook
 * controller, the sweeper) depends on this, never on a concrete adapter —
 * swapping PAYMENT_PROVIDER never touches a caller.
 *
 * The active provider is resolved LAZILY, per call, from PAYMENT_PROVIDER
 * (default "mock") — not cached at construction time. Adapters register
 * themselves with PaymentProviderRegistry in their own onModuleInit hook,
 * which Nest runs strictly after every provider's constructor across the
 * whole module graph; resolving eagerly in this constructor would race
 * that and could see an empty registry even for the valid "mock" case.
 * Port of kds's backend/src/modules/payments-core/payments-facade.service.ts,
 * trimmed of the outbox/metrics side-effects kurtar doesn't have yet.
 */
@Injectable()
export class PaymentsFacadeService {
  constructor(
    private readonly registry: PaymentProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  /** The configured provider id (PAYMENT_PROVIDER, default "mock"). */
  activeProviderId(): ValidPaymentProvider {
    return (
      (this.configService.get<string>(
        "PAYMENT_PROVIDER",
      ) as ValidPaymentProvider) || "mock"
    );
  }

  private activeProvider(): PaymentProvider {
    return this.registry.get(this.activeProviderId());
  }

  // Every method below is declared `async` deliberately, even though it
  // only ever awaits a single call — activeProvider() itself throws
  // synchronously for an unregistered id, and without `async` that throw
  // would escape as a thrown exception from the call site instead of a
  // rejected Promise, which every caller here (reservations, the webhook
  // controller, the sweeper) awaits and expects to reject cleanly.
  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    return this.activeProvider().createIntent(params);
  }

  async queryStatus(merchantOid: string): Promise<QueryStatusResult> {
    return this.activeProvider().queryStatus(merchantOid);
  }

  async refund(
    merchantOid: string,
    amountCents: number,
  ): Promise<RefundResult> {
    return this.activeProvider().refund(merchantOid, amountCents);
  }

  async payout(
    merchantRef: string,
    amountCents: number,
    ref: string,
  ): Promise<PayoutResult> {
    return this.activeProvider().payout(merchantRef, amountCents, ref);
  }

  async parseWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookEvent> {
    return this.activeProvider().parseWebhook(rawBody, headers);
  }

  async healthCheck() {
    return this.activeProvider().healthCheck();
  }
}
