import { NotFoundException } from "@nestjs/common";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { PaymentProvider } from "./payment-provider.interface";

function fakeProvider(id: "mock" | "iyzico" | "paytr"): PaymentProvider {
  return {
    id,
    createIntent: jest.fn(),
    queryStatus: jest.fn(),
    refund: jest.fn(),
    parseWebhook: jest.fn(),
    healthCheck: jest.fn(),
  };
}

describe("PaymentProviderRegistry", () => {
  it("returns a registered provider by id", () => {
    const registry = new PaymentProviderRegistry();
    const provider = fakeProvider("mock");
    registry.register(provider);
    expect(registry.get("mock")).toBe(provider);
  });

  it("throws NotFoundException for an id nothing registered (unimplemented provider)", () => {
    const registry = new PaymentProviderRegistry();
    expect(() => registry.get("iyzico")).toThrow(NotFoundException);
    expect(() => registry.get("iyzico")).toThrow(
      /Unknown payment provider: iyzico/,
    );
  });

  it("re-registering the same id overwrites (logs a warning, last write wins)", () => {
    const registry = new PaymentProviderRegistry();
    const first = fakeProvider("mock");
    const second = fakeProvider("mock");
    registry.register(first);
    registry.register(second);
    expect(registry.get("mock")).toBe(second);
  });
});
