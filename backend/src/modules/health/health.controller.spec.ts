import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PrismaService } from "../../prisma/prisma.service";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      // The controller gained a Prisma dependency when readiness was
      // added; liveness itself still touches nothing.
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: async () => [{ "?column?": 1 }] },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("is defined", () => {
    expect(controller).toBeDefined();
  });

  it("reports ok status with the service name and a non-negative uptime", () => {
    const result = controller.getHealth();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("kurtar-api");
    expect(typeof result.uptimeSec).toBe("number");
    expect(result.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it("returns exactly the documented shape", () => {
    const result = controller.getHealth();

    expect(Object.keys(result).sort()).toEqual(
      ["service", "status", "uptimeSec"].sort(),
    );
  });
});

describe("HealthController.getReady — readiness is a different question from liveness", () => {
  function kur(sorgu: () => Promise<unknown>) {
    return new HealthController({
      $queryRaw: sorgu,
    } as unknown as PrismaService);
  }

  it("reports ready when the database answers", async () => {
    await expect(
      kur(async () => [{ "?column?": 1 }]).getReady(),
    ).resolves.toEqual({
      status: "ready",
      database: "up",
    });
  });

  it("reports degraded — not ok — when the database is unreachable", async () => {
    // This is the whole point: /api/health returns "ok" in exactly this
    // situation, and the setup docs used to send newcomers there to check
    // whether the system had come up.
    const sonuc = await kur(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:4754");
    }).getReady();
    expect(sonuc.status).toBe("degraded");
    expect(sonuc.database).toBe("down");
    expect(sonuc.detay).toContain("ECONNREFUSED");
  });

  it("does not throw, so the caller reads a reason instead of a bare failure", async () => {
    await expect(
      kur(async () => {
        throw new Error("kapalı");
      }).getReady(),
    ).resolves.toBeDefined();
  });
});
