import { ConfigService } from "@nestjs/config";
import { NilveraAdapter } from "./nilvera.adapter";
import { EDocumentProviderRegistry } from "../e-document-provider.registry";

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const SAMPLE_INVOICE = {
  invoiceId: "inv1",
  docType: "EARSIVFATURA" as const,
  buyerTaxId: "1234567890",
  buyerLegalName: "Test Firma",
  lines: [],
  totalAmountCents: 1000,
};

describe("NilveraAdapter", () => {
  describe("onModuleInit — registration only with BOTH credentials", () => {
    it("does not register when neither env var is set", () => {
      const registry = new EDocumentProviderRegistry();
      const adapter = new NilveraAdapter(config({}), registry);
      adapter.onModuleInit();
      expect(() => registry.get("nilvera")).toThrow(/Unknown/);
    });

    it("does not register with only NILVERA_API_KEY set", () => {
      const registry = new EDocumentProviderRegistry();
      const adapter = new NilveraAdapter(
        config({ NILVERA_API_KEY: "key" }),
        registry,
      );
      adapter.onModuleInit();
      expect(() => registry.get("nilvera")).toThrow(/Unknown/);
    });

    it("does not register with only NILVERA_API_URL set", () => {
      const registry = new EDocumentProviderRegistry();
      const adapter = new NilveraAdapter(
        config({ NILVERA_API_URL: "https://nilvera.example" }),
        registry,
      );
      adapter.onModuleInit();
      expect(() => registry.get("nilvera")).toThrow(/Unknown/);
    });

    it("registers only when BOTH are set", () => {
      const registry = new EDocumentProviderRegistry();
      const adapter = new NilveraAdapter(
        config({
          NILVERA_API_KEY: "key",
          NILVERA_API_URL: "https://nilvera.example",
        }),
        registry,
      );
      adapter.onModuleInit();
      expect(registry.get("nilvera")).toBe(adapter);
    });
  });

  describe("issue() — [Fix round, I11] hard-disabled independent of config", () => {
    it("throws even when both credentials ARE configured", async () => {
      const adapter = new NilveraAdapter(
        config({
          NILVERA_API_KEY: "key",
          NILVERA_API_URL: "https://nilvera.example",
        }),
        new EDocumentProviderRegistry(),
      );
      await expect(adapter.issue(SAMPLE_INVOICE)).rejects.toThrow(
        /not implemented/i,
      );
    });

    it("throws when unconfigured", async () => {
      const adapter = new NilveraAdapter(
        config({}),
        new EDocumentProviderRegistry(),
      );
      await expect(adapter.issue(SAMPLE_INVOICE)).rejects.toThrow(
        /not implemented/i,
      );
    });
  });

  describe("isRegisteredEFaturaUser — the mükellef-lookup hook", () => {
    it("returns null (unknown) when unconfigured, never attempting a network call", async () => {
      const adapter = new NilveraAdapter(
        config({}),
        new EDocumentProviderRegistry(),
      );
      await expect(adapter.isRegisteredEFaturaUser("1234567890")).resolves.toBe(
        null,
      );
    });
  });

  describe("healthCheck", () => {
    it("reports not-configured when credentials are missing", async () => {
      const adapter = new NilveraAdapter(
        config({}),
        new EDocumentProviderRegistry(),
      );
      await expect(adapter.healthCheck()).resolves.toEqual({
        ok: false,
        details: { reason: "not configured" },
      });
    });
  });
});
