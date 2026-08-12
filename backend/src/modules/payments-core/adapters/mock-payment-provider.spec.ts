import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { MockPaymentProvider } from "./mock-payment-provider";
import { PaymentProviderRegistry } from "../payment-provider.registry";

const WEBHOOK_SECRET = "test-webhook-secret";

function configWithSecret(secret: string = WEBHOOK_SECRET): ConfigService {
  return { get: () => secret } as unknown as ConfigService;
}

function configWithoutSecret(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

describe("MockPaymentProvider", () => {
  it("refuses to construct without WEBHOOK_SECRET configured", () => {
    expect(
      () =>
        new MockPaymentProvider(
          configWithoutSecret(),
          new PaymentProviderRegistry(),
        ),
    ).toThrow(/WEBHOOK_SECRET is not configured/);
  });

  it("registers itself outside production, not in production", () => {
    const prodRegistry = new PaymentProviderRegistry();
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const prodProvider = new MockPaymentProvider(
        configWithSecret(),
        prodRegistry,
      );
      prodProvider.onModuleInit();
      expect(() => prodRegistry.get("mock")).toThrow(
        /Unknown payment provider/,
      );

      process.env.NODE_ENV = "test";
      const devRegistry = new PaymentProviderRegistry();
      const devProvider = new MockPaymentProvider(
        configWithSecret(),
        devRegistry,
      );
      devProvider.onModuleInit();
      expect(devRegistry.get("mock")).toBe(devProvider);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("createIntent is idempotent for the same merchantOid", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    const first = await provider.createIntent({
      merchantOid: "KRV-abc",
      amountCents: 5000,
      idempotencyKey: "k1",
    });
    const second = await provider.createIntent({
      merchantOid: "KRV-abc",
      amountCents: 5000,
      idempotencyKey: "k1",
    });
    expect(second).toEqual(first);
  });

  it("queryStatus throws for an unknown merchantOid", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await expect(provider.queryStatus("nope")).rejects.toThrow(
      /Mock intent not found/,
    );
  });

  it("queryStatus reflects the intent's initial pending state", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await provider.createIntent({
      merchantOid: "oid1",
      amountCents: 1000,
      idempotencyKey: "k",
    });
    await expect(provider.queryStatus("oid1")).resolves.toEqual({
      status: "pending",
      paidAmountCents: undefined,
    });
  });

  it("refund records the call in the refund log and returns a refundRef", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await provider.createIntent({
      merchantOid: "oid2",
      amountCents: 1000,
      idempotencyKey: "k",
    });
    const result = await provider.refund("oid2", 1000);
    expect(result.refundRef).toEqual(expect.stringContaining("mock-refund-"));
    expect(provider.getRefundLog()).toEqual([
      { merchantOid: "oid2", amountCents: 1000, refundRef: result.refundRef },
    ]);
  });

  it("refund throws for an unknown merchantOid", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await expect(provider.refund("nope", 100)).rejects.toThrow(
      /Mock intent not found/,
    );
  });

  describe("parseWebhook", () => {
    it("rejects a request missing/mismatching the webhook secret header", async () => {
      const provider = new MockPaymentProvider(
        configWithSecret(),
        new PaymentProviderRegistry(),
      );
      const body = JSON.stringify({
        merchantOid: "oid",
        status: "success",
        totalCents: 100,
        eventId: "e1",
      });
      await expect(provider.parseWebhook(body, {})).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        provider.parseWebhook(body, { "x-webhook-secret": "wrong" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects malformed JSON", async () => {
      const provider = new MockPaymentProvider(
        configWithSecret(),
        new PaymentProviderRegistry(),
      );
      await expect(
        provider.parseWebhook("not json", {
          "x-webhook-secret": WEBHOOK_SECRET,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a payload missing required fields", async () => {
      const provider = new MockPaymentProvider(
        configWithSecret(),
        new PaymentProviderRegistry(),
      );
      await expect(
        provider.parseWebhook(JSON.stringify({ merchantOid: "oid" }), {
          "x-webhook-secret": WEBHOOK_SECRET,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("parses a valid payload and updates the provider's own status view", async () => {
      const provider = new MockPaymentProvider(
        configWithSecret(),
        new PaymentProviderRegistry(),
      );
      await provider.createIntent({
        merchantOid: "oid3",
        amountCents: 2500,
        idempotencyKey: "k",
      });

      const event = await provider.parseWebhook(
        JSON.stringify({
          merchantOid: "oid3",
          status: "success",
          totalCents: 2500,
          eventId: "evt-1",
        }),
        { "x-webhook-secret": WEBHOOK_SECRET },
      );

      expect(event).toEqual({
        merchantOid: "oid3",
        status: "success",
        totalCents: 2500,
        externalEventId: "evt-1",
      });
      await expect(provider.queryStatus("oid3")).resolves.toEqual({
        status: "paid",
        paidAmountCents: 2500,
      });
    });

    it("buildWebhookRequest() produces a payload parseWebhook() accepts", async () => {
      const provider = new MockPaymentProvider(
        configWithSecret(),
        new PaymentProviderRegistry(),
      );
      await provider.createIntent({
        merchantOid: "oid4",
        amountCents: 750,
        idempotencyKey: "k",
      });
      const { body, headers } = provider.buildWebhookRequest({
        merchantOid: "oid4",
        status: "success",
        totalCents: 750,
      });
      const event = await provider.parseWebhook(body, headers);
      expect(event.merchantOid).toBe("oid4");
      expect(event.status).toBe("success");
    });
  });

  it("setProviderSideStatus() drives queryStatus() directly, independent of parseWebhook", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await provider.createIntent({
      merchantOid: "oid5",
      amountCents: 400,
      idempotencyKey: "k",
    });
    provider.setProviderSideStatus("oid5", "paid", 400);
    await expect(provider.queryStatus("oid5")).resolves.toEqual({
      status: "paid",
      paidAmountCents: 400,
    });
  });

  it("healthCheck reports ok:true with the mock mode", async () => {
    const provider = new MockPaymentProvider(
      configWithSecret(),
      new PaymentProviderRegistry(),
    );
    await expect(provider.healthCheck()).resolves.toEqual({
      ok: true,
      details: { mode: "mock", intents: 0 },
    });
  });
});
