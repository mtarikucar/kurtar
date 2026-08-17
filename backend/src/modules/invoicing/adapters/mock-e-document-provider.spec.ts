import { MockEDocumentProvider } from "./mock-e-document-provider";
import { EDocumentProviderRegistry } from "../e-document-provider.registry";

const SAMPLE_INVOICE = {
  invoiceId: "inv1",
  docType: "EARSIVFATURA" as const,
  buyerTaxId: "1234567890",
  buyerLegalName: "Test Firma",
  lines: [],
  totalAmountCents: 1000,
};

describe("MockEDocumentProvider", () => {
  it("registers itself outside production, not in production", () => {
    const prodRegistry = new EDocumentProviderRegistry();
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const prodProvider = new MockEDocumentProvider(prodRegistry);
      prodProvider.onModuleInit();
      expect(() => prodRegistry.get("mock")).toThrow(
        /Unknown e-document provider/,
      );

      process.env.NODE_ENV = "test";
      const devRegistry = new EDocumentProviderRegistry();
      const devProvider = new MockEDocumentProvider(devRegistry);
      devProvider.onModuleInit();
      expect(devRegistry.get("mock")).toBe(devProvider);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("issue() is idempotent by invoiceId — a repeat call returns the same docId", async () => {
    const provider = new MockEDocumentProvider(new EDocumentProviderRegistry());
    const first = await provider.issue(SAMPLE_INVOICE);
    const second = await provider.issue(SAMPLE_INVOICE);
    expect(second).toEqual(first);
    expect(provider.getIssuedLog().size).toBe(1);
  });

  it("healthCheck reports ok:true with the mock mode", async () => {
    const provider = new MockEDocumentProvider(new EDocumentProviderRegistry());
    await expect(provider.healthCheck()).resolves.toEqual({
      ok: true,
      details: { mode: "mock", issued: 0 },
    });
  });
});
