import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import { EDocumentProvider } from "./e-document-provider.interface";

function fakeProvider(id: string): EDocumentProvider {
  return {
    id,
    issue: jest.fn().mockResolvedValue({ docId: "d1", status: "issued" }),
    healthCheck: jest.fn().mockResolvedValue({ ok: true }),
  };
}

describe("EDocumentProviderRegistry", () => {
  it("returns a registered provider by id", () => {
    const registry = new EDocumentProviderRegistry();
    const provider = fakeProvider("mock");
    registry.register(provider);

    expect(registry.get("mock")).toBe(provider);
  });

  it("throws NotFoundException for an id nothing registered", () => {
    const registry = new EDocumentProviderRegistry();
    registry.register(fakeProvider("mock"));

    expect(() => registry.get("nilvera")).toThrow(
      /Unknown e-document provider: nilvera/,
    );
  });

  it("a later registration for the same id wins over an earlier one", () => {
    const registry = new EDocumentProviderRegistry();
    const first = fakeProvider("mock");
    const second = fakeProvider("mock");
    registry.register(first);
    registry.register(second);

    expect(registry.get("mock")).toBe(second);
  });
});
