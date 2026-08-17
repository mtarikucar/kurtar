import { ConfigService } from "@nestjs/config";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import { EDocumentProvider } from "./e-document-provider.interface";

function fakeProvider(id: string): EDocumentProvider {
  return {
    id,
    issue: jest.fn().mockResolvedValue({ docId: "d1", status: "issued" }),
    healthCheck: jest.fn().mockResolvedValue({ ok: true }),
  };
}

function configReturning(value: string | undefined): ConfigService {
  return { get: () => value } as unknown as ConfigService;
}

const SAMPLE_INVOICE = {
  invoiceId: "inv1",
  docType: "EARSIVFATURA" as const,
  buyerTaxId: "1234567890",
  buyerLegalName: "Test Firma",
  lines: [],
  totalAmountCents: 1000,
};

describe("EDocumentFacadeService — provider selection", () => {
  it("defaults to 'mock' when EDOC_PROVIDER is unset", async () => {
    const registry = new EDocumentProviderRegistry();
    const mock = fakeProvider("mock");
    registry.register(mock);
    const facade = new EDocumentFacadeService(
      registry,
      configReturning(undefined),
    );

    expect(facade.activeProviderId()).toBe("mock");
    await facade.issue(SAMPLE_INVOICE);
    expect(mock.issue).toHaveBeenCalledWith(SAMPLE_INVOICE);
  });

  it("dispatches healthCheck to the configured provider", async () => {
    const registry = new EDocumentProviderRegistry();
    const mock = fakeProvider("mock");
    registry.register(mock);
    const facade = new EDocumentFacadeService(
      registry,
      configReturning("mock"),
    );

    await facade.healthCheck();
    expect(mock.healthCheck).toHaveBeenCalledTimes(1);
  });

  it("throws NotFoundException when EDOC_PROVIDER names a provider nothing registered", async () => {
    const registry = new EDocumentProviderRegistry();
    registry.register(fakeProvider("mock"));
    const facade = new EDocumentFacadeService(
      registry,
      configReturning("nilvera"),
    );

    await expect(facade.issue(SAMPLE_INVOICE)).rejects.toThrow(
      /Unknown e-document provider: nilvera/,
    );
  });
});
