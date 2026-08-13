import { DiscoveryService } from "./discovery.service";
import type { DiscoveryMapQueryDto } from "./dto/discovery-map-query.dto";

/**
 * Unit coverage for DiscoveryService.map()'s bbox validation — deliberately
 * NOT a realdb spec (discovery-radius.realdb.spec.ts already exercises the
 * happy-path map() query end to end against real PostGIS): every case here
 * is a request that must be rejected BEFORE ever reaching the database, so
 * a bare Prisma stub whose $queryRaw asserts it was never called is enough
 * to prove it.
 */
function makePrisma(rows: unknown[] = []) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) } as any;
}

function makeCache() {
  return { get: jest.fn(), set: jest.fn() } as any;
}

function bbox(
  overrides: Partial<DiscoveryMapQueryDto> = {},
): DiscoveryMapQueryDto {
  return {
    west: 29.0,
    south: 41.0,
    east: 29.05,
    north: 41.05,
    ...overrides,
  } as DiscoveryMapQueryDto;
}

describe("DiscoveryService.map — bbox validation", () => {
  it("accepts a normal small viewport and queries the DB", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    const result = await service.map(bbox());

    expect(result).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects west >= east without ever querying the DB", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    await expect(
      service.map(bbox({ west: 29.1, east: 29.0 })),
    ).rejects.toMatchObject({
      response: { errorCode: "DISCOVERY_BBOX_INVALID" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects south >= north without ever querying the DB", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    await expect(
      service.map(bbox({ south: 41.1, north: 41.0 })),
    ).rejects.toMatchObject({
      response: { errorCode: "DISCOVERY_BBOX_INVALID" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("[B2] rejects a degenerate NORTH-SOUTH strip that is under the area cap but spans nearly every latitude", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    // width 0.001° x height 178° -> area 0.178 deg² (comfortably under the
    // 1 deg² area cap) yet the box spans nearly pole-to-pole — exactly the
    // hole an area-only guard misses.
    await expect(
      service.map(bbox({ west: 29.0, east: 29.001, south: -89, north: 89 })),
    ).rejects.toMatchObject({
      response: { errorCode: "DISCOVERY_BBOX_TOO_LARGE" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("[B2] rejects the mirror-image EAST-WEST strip the same way", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    // width 170° x height 0.001° -> area 0.17 deg², same degenerate shape
    // rotated 90 degrees.
    await expect(
      service.map(bbox({ west: -85, east: 85, south: 41.0, north: 41.001 })),
    ).rejects.toMatchObject({
      response: { errorCode: "DISCOVERY_BBOX_TOO_LARGE" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects an oversized-but-roughly-square box via the area cap even though each side is under the per-side span cap", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    // 1.2° x 1.2° -> both sides under the 1.5° per-side cap, but area
    // 1.44 deg² exceeds the 1 deg² area cap.
    await expect(
      service.map(bbox({ west: 29.0, east: 30.2, south: 41.0, north: 42.2 })),
    ).rejects.toMatchObject({
      response: { errorCode: "DISCOVERY_BBOX_TOO_LARGE" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("accepts a larger-but-legitimate viewport under both caps", async () => {
    const prisma = makePrisma();
    const service = new DiscoveryService(prisma, makeCache());

    // 1.2° x 0.5° -> area 0.6 deg² (< 1), both sides < 1.5°.
    const result = await service.map(
      bbox({ west: 29.0, east: 30.2, south: 41.0, north: 41.5 }),
    );

    expect(result).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
