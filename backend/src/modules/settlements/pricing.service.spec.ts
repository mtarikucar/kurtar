import { PricingService } from "./pricing.service";

describe("PricingService.scheduleFuturePricing", () => {
  it("rejects an effectiveFrom that is not strictly in the future", async () => {
    const prisma = { platformPricing: { create: jest.fn() } };
    const service = new PricingService(prisma as never);

    await expect(
      service.scheduleFuturePricing({
        bagFeeCents: 3000,
        membershipAnnualCents: 250000,
        effectiveFrom: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow(/future/i);
    expect(prisma.platformPricing.create).not.toHaveBeenCalled();
  });

  it("accepts a future effectiveFrom and creates the row", async () => {
    const created = { id: "p1" };
    const prisma = {
      platformPricing: { create: jest.fn().mockResolvedValue(created) },
    };
    const service = new PricingService(prisma as never);

    const params = {
      bagFeeCents: 3000,
      membershipAnnualCents: 250000,
      effectiveFrom: new Date(Date.now() + 60_000),
    };
    const result = await service.scheduleFuturePricing(params);
    expect(result).toBe(created);
    expect(prisma.platformPricing.create).toHaveBeenCalledWith({
      data: params,
    });
  });
});
