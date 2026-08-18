import { BadRequestException } from "@nestjs/common";
import { PricingService } from "./pricing.service";

describe("PricingService.scheduleFuturePricing", () => {
  it("rejects an effectiveFrom that is not strictly in the future with a proper {statusCode, errorCode, message} exception", async () => {
    const prisma = { platformPricing: { create: jest.fn() } };
    const service = new PricingService(prisma as never);

    expect.assertions(5);
    try {
      await service.scheduleFuturePricing(
        {
          bagFeeCents: 3000,
          membershipAnnualCents: 250000,
          effectiveFrom: new Date(Date.now() - 1000),
        },
        "admin-1",
      );
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

  it("accepts a future effectiveFrom and creates the row WITH an ADMIN audit row, in one transaction", async () => {
    const created = { id: "p1" };
    const auditCreate = jest.fn().mockResolvedValue({});
    const pricingCreate = jest.fn().mockResolvedValue(created);
    const prisma = {
      platformPricing: { create: pricingCreate },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          platformPricing: { create: pricingCreate },
          auditLog: { create: auditCreate },
        }),
      ),
    };
    const service = new PricingService(prisma as never);

    const params = {
      bagFeeCents: 3000,
      membershipAnnualCents: 250000,
      effectiveFrom: new Date(Date.now() + 60_000),
    };
    const result = await service.scheduleFuturePricing(params, "admin-7");
    expect(result).toBe(created);
    expect(pricingCreate).toHaveBeenCalledWith({ data: params });
    // [Fix round #6, I5] This endpoint changes the per-bag fee for every
    // merchant on the platform; it used to leave no record of who did it.
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorType: "ADMIN",
        actorId: "admin-7",
        action: "pricing.scheduled",
        entity: "PlatformPricing",
        entityId: "p1",
        diffJson: {
          bagFeeCents: 3000,
          membershipAnnualCents: 250000,
          effectiveFrom: params.effectiveFrom.toISOString(),
        },
      },
    });
  });
});
