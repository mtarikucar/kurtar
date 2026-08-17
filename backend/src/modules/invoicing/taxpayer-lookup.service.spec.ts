import { TaxpayerLookupService } from "./taxpayer-lookup.service";
import { NilveraAdapter } from "./adapters/nilvera.adapter";

describe("TaxpayerLookupService", () => {
  it("delegates to NilveraAdapter.isRegisteredEFaturaUser", async () => {
    const nilvera = {
      isRegisteredEFaturaUser: jest.fn().mockResolvedValue(true),
    } as unknown as NilveraAdapter;
    const service = new TaxpayerLookupService(nilvera);

    await expect(service.checkIsEFaturaUser("1234567890")).resolves.toBe(true);
    expect(nilvera.isRegisteredEFaturaUser).toHaveBeenCalledWith("1234567890");
  });

  it("resolves null (unknown) when the adapter itself is unconfigured — the documented 'unknown ⇒ EARSIVFATURA for now' path", async () => {
    const nilvera = {
      isRegisteredEFaturaUser: jest.fn().mockResolvedValue(null),
    } as unknown as NilveraAdapter;
    const service = new TaxpayerLookupService(nilvera);

    await expect(service.checkIsEFaturaUser("1234567890")).resolves.toBe(null);
  });
});
