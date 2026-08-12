import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
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
