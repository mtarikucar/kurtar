import { Global, Module } from "@nestjs/common";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { PaymentsFacadeService } from "./payments-facade.service";
import { MockPaymentProvider } from "./adapters/mock-payment-provider";

/**
 * Payments-core module — the provider-neutral seam. @Global so
 * reservations/payments (and any future module) can inject
 * PaymentsFacadeService without each declaring their own import of every
 * concrete adapter. Port of kds's
 * backend/src/modules/payments-core/payments-core.module.ts, trimmed to
 * the one adapter Task 4 actually implements.
 */
@Global()
@Module({
  providers: [
    PaymentProviderRegistry,
    PaymentsFacadeService,
    MockPaymentProvider,
  ],
  exports: [PaymentProviderRegistry, PaymentsFacadeService],
})
export class PaymentsCoreModule {}
