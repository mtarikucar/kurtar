import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PaymentProvider } from "./payment-provider.interface";

/**
 * Registry of installed PaymentProvider adapters, keyed by id. Adapters
 * self-register at module init (see MockPaymentProvider.onModuleInit) —
 * only what's actually implemented is ever in this map, so requesting an
 * id nothing implements (PAYMENT_PROVIDER=iyzico today) is a clean 404
 * here rather than a silent no-op or a boot-time guess about what "will
 * eventually" exist. Port of kds's
 * backend/src/modules/payments-core/payment-provider.registry.ts.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`PaymentProvider ${provider.id} re-registered`);
    }
    this.providers.set(provider.id, provider);
    this.logger.log(`Registered PaymentProvider: ${provider.id}`);
  }

  get(id: string): PaymentProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new NotFoundException(`Unknown payment provider: ${id}`);
    }
    return provider;
  }
}
