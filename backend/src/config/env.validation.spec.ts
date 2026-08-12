import { validate, VALID_NODE_ENVS } from "./env.validation";

describe("env.validation — NODE_ENV enumeration (fail-fast)", () => {
  it("refuses to boot when NODE_ENV is missing entirely", () => {
    expect(() => validate({})).toThrow(/NODE_ENV must be one of/);
  });

  it("refuses to boot on a misspelled/unrecognized NODE_ENV", () => {
    expect(() => validate({ NODE_ENV: "prod" })).toThrow(
      /NODE_ENV must be one of/,
    );
    expect(() => validate({ NODE_ENV: "Production" })).toThrow(
      /NODE_ENV must be one of/,
    );
    expect(() => validate({ NODE_ENV: "" })).toThrow(/NODE_ENV must be one of/);
  });

  it.each(VALID_NODE_ENVS)(
    "accepts NODE_ENV=%s (non-production branch, DB vars optional)",
    (env) => {
      if (env === "production") return; // covered separately below
      expect(() => validate({ NODE_ENV: env })).not.toThrow();
    },
  );

  it("accepts NODE_ENV=production when DATABASE_URL/REDIS_URL are set", () => {
    expect(() =>
      validate({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x",
        REDIS_URL: "redis://x",
      }),
    ).not.toThrow();
  });
});

describe("env.validation — DATABASE_URL/REDIS_URL production requirement", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  afterEach(() => warnSpy.mockClear());
  afterAll(() => warnSpy.mockRestore());

  it("refuses to boot in production without DATABASE_URL/REDIS_URL", () => {
    expect(() => validate({ NODE_ENV: "production" })).toThrow(
      /missing required environment variable\(s\) in production: DATABASE_URL, REDIS_URL/,
    );
  });

  it("warns but does not throw in development without DATABASE_URL/REDIS_URL", () => {
    expect(() => validate({ NODE_ENV: "development" })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_URL"),
    );
  });
});
