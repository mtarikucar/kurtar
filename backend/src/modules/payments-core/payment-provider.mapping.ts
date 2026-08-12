import { PaymentProvider as PrismaPaymentProviderEnum } from "@prisma/client";
import { ValidPaymentProvider } from "../../config/env.validation";

/**
 * The active provider is selected via the lowercase config enum
 * (PAYMENT_PROVIDER=mock|iyzico|paytr, config/env.validation.ts) but
 * persisted on Payment.provider as Prisma's uppercase PaymentProvider
 * enum (MOCK|IYZICO|PAYTR, prisma/schema.prisma). This is the one place
 * that translates between the two so the mapping can't drift silently.
 */
const CONFIG_TO_PRISMA_PROVIDER: Record<
  ValidPaymentProvider,
  PrismaPaymentProviderEnum
> = {
  mock: "MOCK",
  iyzico: "IYZICO",
  paytr: "PAYTR",
};

export function toPrismaPaymentProvider(
  id: ValidPaymentProvider,
): PrismaPaymentProviderEnum {
  return CONFIG_TO_PRISMA_PROVIDER[id];
}
