import { ConfigService } from "@nestjs/config";
import { DiscoveryCacheService } from "./discovery-cache.service";

const mockRedisInstance = {
  connect: jest.fn(),
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  quit: jest.fn(),
};

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

function configWith(url: string | undefined): ConfigService {
  return { get: () => url } as unknown as ConfigService;
}

describe("DiscoveryCacheService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance.connect.mockResolvedValue(undefined);
    mockRedisInstance.quit.mockResolvedValue(undefined);
  });

  it("stays disabled (no client) when REDIS_URL is not configured — get/set are no-ops", async () => {
    const service = new DiscoveryCacheService(configWith(undefined));
    service.onModuleInit();

    await expect(service.get("k")).resolves.toBeNull();
    await expect(service.set("k", { a: 1 }, 45)).resolves.toBeUndefined();
    expect(mockRedisInstance.get).not.toHaveBeenCalled();
    expect(mockRedisInstance.set).not.toHaveBeenCalled();
  });

  it("get() returns the parsed value on a hit", async () => {
    mockRedisInstance.get.mockResolvedValue(JSON.stringify({ hello: "world" }));
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();

    await expect(service.get<{ hello: string }>("k")).resolves.toEqual({
      hello: "world",
    });
  });

  it("get() returns null on a miss", async () => {
    mockRedisInstance.get.mockResolvedValue(null);
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();

    await expect(service.get("k")).resolves.toBeNull();
  });

  it("degrades gracefully: get() never throws when Redis errors, returns null instead", async () => {
    mockRedisInstance.get.mockRejectedValue(new Error("connection refused"));
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();

    await expect(service.get("k")).resolves.toBeNull();
  });

  it("degrades gracefully: set() never throws when Redis errors", async () => {
    mockRedisInstance.set.mockRejectedValue(new Error("connection refused"));
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();

    await expect(service.set("k", {}, 45)).resolves.toBeUndefined();
  });

  it("set() calls SET with EX ttl and a JSON-serialized value", async () => {
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();

    await service.set("mykey", { a: 1 }, 45);
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "mykey",
      JSON.stringify({ a: 1 }),
      "EX",
      45,
    );
  });

  it("onModuleDestroy quits the client if one was created", async () => {
    const service = new DiscoveryCacheService(
      configWith("redis://localhost:1234"),
    );
    service.onModuleInit();
    await service.onModuleDestroy();
    expect(mockRedisInstance.quit).toHaveBeenCalled();
  });

  it("onModuleDestroy is a no-op when no client was created", async () => {
    const service = new DiscoveryCacheService(configWith(undefined));
    service.onModuleInit();
    await service.onModuleDestroy();
    expect(mockRedisInstance.quit).not.toHaveBeenCalled();
  });
});
