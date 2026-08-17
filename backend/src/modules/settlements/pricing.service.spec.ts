import { BadRequestException } from "@nestjs/common";
import { PricingService } from "./pricing.service";

describe("PricingService.scheduleFuturePricing", () => {
  it("rejects an effectiveFrom that is not strictly in the future with a proper {statusCode, errorCode, message} exception", async () => {
    const prisma = { platformPricing: { create: jest.fn() } };
    const service = new PricingService(prisma as never);

    expect.assertions(5);
    try {
      await service.scheduleFuturePricing({
        bagFeeCents: 3000,
        membershipAnnualCents: 250000,
        effectiveFrom: new Date(Date.now() - 1000),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(400);
      expect(response.errorCode).toBe("PRICING_EFFECTIVE_FROM_NOT_FUTURE");
      expect(response.message as string).toMatch(/future/i);
    }
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
