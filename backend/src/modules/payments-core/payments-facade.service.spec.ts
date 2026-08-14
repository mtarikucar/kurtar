import { ConfigService } from "@nestjs/config";
import { PaymentsFacadeService } from "./payments-facade.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { PaymentProvider } from "./payment-provider.interface";

function fakeProvider(id: "mock" | "iyzico" | "paytr"): PaymentProvider {
  return {
    id,
    createIntent: jest.fn().mockResolvedValue({ providerRef: "ref" }),
    queryStatus: jest.fn().mockResolvedValue({ status: "pending" }),
    refund: jest.fn().mockResolvedValue({ refundRef: "r" }),
    parseWebhook: jest.fn().mockResolvedValue({
      merchantOid: "m",
      status: "success",
      totalCents: 100,
      externalEventId: "e",
    }),
    healthCheck: jest.fn().mockResolvedValue({ ok: true }),
  };
}

function configReturning(value: string | undefined): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

describe("PaymentsFacadeService — provider selection", () => {
  it("defaults to 'mock' when PAYMENT_PROVIDER is unset", async () => {
    const registry = new PaymentProviderRegistry();
    const mock = fakeProvider("mock");
    registry.register(mock);
    const facade = new PaymentsFacadeService(
      registry,
      configReturning(undefined),
    );

    expect(facade.activeProviderId()).toBe("mock");
    await facade.createIntent({
      merchantOid: "x",
      amountCents: 100,
      idempotencyKey: "k",
    });
    expect(mock.createIntent).toHaveBeenCalledTimes(1);
  });

  it("dispatches every façade method to the configured provider", async () => {
    const registry = new PaymentProviderRegistry();
    const mock = fakeProvider("mock");
    registry.register(mock);
    const facade = new PaymentsFacadeService(registry, configReturning("mock"));

    await facade.queryStatus("oid");
    await facade.refund("oid", 100);
    await facade.parseWebhook("{}", {});
    await facade.healthCheck();

    expect(mock.queryStatus).toHaveBeenCalledWith("oid");
    expect(mock.refund).toHaveBeenCalledWith("oid", 100);
    expect(mock.parseWebhook).toHaveBeenCalledWith("{}", {});
    expect(mock.healthCheck).toHaveBeenCalledTimes(1);
  });

  it("throws NotFoundException when PAYMENT_PROVIDER names a provider nothing registered", async () => {
    const registry = new PaymentProviderRegistry();
    // Only "mock" is registered — mirrors production reality where only
    // the implemented adapter ever calls registry.register().
    registry.register(fakeProvider("mock"));
    const facade = new PaymentsFacadeService(
      registry,
      configReturning("iyzico"),
    );

    await expect(facade.queryStatus("oid")).rejects.toThrow(
      /Unknown payment provider: iyzico/,
    );
  });
});
