// class-validator's decorators (@IsInt, @IsLatitude, etc.) rely on
// reflect-metadata's Reflect.getMetadata being polyfilled. Nest's own
// bootstrap (@nestjs/core) pulls that in as a side effect, but this spec
// exercises the DTO in isolation — nothing else in its import chain loads
// the polyfill, so it must be imported explicitly, first.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DiscoveryOffersQueryDto } from "./discovery-offers-query.dto";

// Mirrors what NestJS's global ValidationPipe ({ whitelist: true, transform:
// true } in main.ts) actually does with an incoming query object: raw HTTP
// query params always arrive as strings, plainToInstance applies every
// @Type(() => Number) coercion, then class-validator's validate() runs.
async function validateQuery(raw: Record<string, unknown>) {
  const instance = plainToInstance(DiscoveryOffersQueryDto, raw);
  return validate(instance);
}

function errorProperties(errors: Awaited<ReturnType<typeof validateQuery>>) {
  return errors.map((e) => e.property);
}

describe("DiscoveryOffersQueryDto", () => {
  const validBase = { lat: "40.9909", lng: "29.0304" };

  it("accepts a minimal valid query (lat/lng only, defaults applied)", async () => {
    const errors = await validateQuery(validBase);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid pickupAfter/pickupBefore ISO datetime strings", async () => {
    const errors = await validateQuery({
      ...validBase,
      pickupAfter: "2026-08-13T10:00:00.000Z",
      pickupBefore: "2026-08-13T12:00:00.000Z",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects a one-character garbage pickupAfter (would otherwise reach `new Date()` as Invalid Date and 500 at the SQL bind)", async () => {
    const errors = await validateQuery({ ...validBase, pickupAfter: "x" });
    expect(errorProperties(errors)).toContain("pickupAfter");
  });

  it("rejects a garbage pickupBefore", async () => {
    const errors = await validateQuery({
      ...validBase,
      pickupBefore: "not-a-date",
    });
    expect(errorProperties(errors)).toContain("pickupBefore");
  });

  it("rejects missing lat/lng", async () => {
    const errors = await validateQuery({});
    const props = errorProperties(errors);
    expect(props).toContain("lat");
    expect(props).toContain("lng");
  });

  it("rejects an out-of-range latitude", async () => {
    const errors = await validateQuery({ lat: "200", lng: "29.0304" });
    expect(errorProperties(errors)).toContain("lat");
  });

  it("rejects a radiusM above the 20000 cap", async () => {
    const errors = await validateQuery({ ...validBase, radiusM: "999999" });
    expect(errorProperties(errors)).toContain("radiusM");
  });

  it("rejects a pageSize above the 40 cap", async () => {
    const errors = await validateQuery({ ...validBase, pageSize: "500" });
    expect(errorProperties(errors)).toContain("pageSize");
  });

  it("rejects an invalid category enum value", async () => {
    const errors = await validateQuery({
      ...validBase,
      category: "NOT_A_CATEGORY",
    });
    expect(errorProperties(errors)).toContain("category");
  });

  it("accepts a q search term containing LIKE metacharacters (DTO doesn't reject them — escaping is the service's job)", async () => {
    const errors = await validateQuery({
      ...validBase,
      q: "50% İndirim_special",
    });
    expect(errors).toHaveLength(0);
  });
});
