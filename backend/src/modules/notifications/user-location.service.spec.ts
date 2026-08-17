import { UserLocationService } from "./user-location.service";

describe("UserLocationService.update", () => {
  it("writes lastLat/lastLng/lastLocationAt for the given user", async () => {
    const prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    const service = new UserLocationService(prisma as any);

    const result = await service.update("u1", 40.99, 29.03);

    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        lastLat: 40.99,
        lastLng: 29.03,
        lastLocationAt: expect.any(Date),
      },
    });
  });
});
