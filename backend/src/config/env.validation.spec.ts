import {
  validate,
  VALID_NODE_ENVS,
  VALID_PAYMENT_PROVIDERS,
  VALID_PUSH_PROVIDERS,
} from "./env.validation";

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

  it("accepts NODE_ENV=production when DATABASE_URL/REDIS_URL/WEBHOOK_SECRET/JWT_SECRET are set and non-mock PAYMENT_PROVIDER/PUSH_PROVIDER are configured", () => {
    // Task 4 additionally requires a real (non-mock) PAYMENT_PROVIDER and
    // WEBHOOK_SECRET in production; Task 7 adds the same requirement for
    // PUSH_PROVIDER — see the dedicated describe blocks below. "iyzico" and
    // "expo" are not implemented/exercised here, but env.validation only
    // asserts the *value* is one each enum recognizes, not that an adapter
    // exists.
    expect(() =>
      validate({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x",
        REDIS_URL: "redis://x",
        WEBHOOK_SECRET: "prod-webhook-secret",
        JWT_SECRET: "prod-jwt-secret",
        PAYMENT_PROVIDER: "iyzico",
        PUSH_PROVIDER: "expo",
      }),
    ).not.toThrow();
  });
});

describe("env.validation — DATABASE_URL/REDIS_URL/WEBHOOK_SECRET/JWT_SECRET production requirement", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  afterEach(() => warnSpy.mockClear());
  afterAll(() => warnSpy.mockRestore());

  it("refuses to boot in production without DATABASE_URL/REDIS_URL/WEBHOOK_SECRET/JWT_SECRET", () => {
    expect(() => validate({ NODE_ENV: "production" })).toThrow(
      /missing required environment variable\(s\) in production: DATABASE_URL, REDIS_URL, WEBHOOK_SECRET, JWT_SECRET/,
    );
  });

  it("refuses to boot in production with DATABASE_URL/REDIS_URL set but WEBHOOK_SECRET missing (I7 — the requirement lives here, not only incidentally in MockPaymentProvider's constructor)", () => {
    expect(() =>
      validate({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x",
        REDIS_URL: "redis://x",
        JWT_SECRET: "prod-jwt-secret",
      }),
    ).toThrow(
      /missing required environment variable\(s\) in production: WEBHOOK_SECRET/,
    );
  });

  it("[B4] refuses to boot in production with every other required var set but JWT_SECRET missing — the same belt-and-suspenders enforcement WEBHOOK_SECRET gets, not left solely to JwtStrategy's own constructor check", () => {
    expect(() =>
      validate({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x",
        REDIS_URL: "redis://x",
        WEBHOOK_SECRET: "prod-webhook-secret",
      }),
    ).toThrow(
      /missing required environment variable\(s\) in production: JWT_SECRET/,
    );
  });

  it("warns but does not throw in development without DATABASE_URL/REDIS_URL/WEBHOOK_SECRET/JWT_SECRET", () => {
    expect(() => validate({ NODE_ENV: "development" })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_URL"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("WEBHOOK_SECRET"),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("JWT_SECRET"));
  });
});

describe("env.validation — PAYMENT_PROVIDER enumeration + prod-mock refusal (Task 4)", () => {
  it("accepts PAYMENT_PROVIDER unset in development (defaults to mock)", () => {
    expect(() => validate({ NODE_ENV: "development" })).not.toThrow();
  });

  it("accepts PAYMENT_PROVIDER=mock explicitly in development/test/staging", () => {
    for (const env of ["development", "test", "staging"] as const) {
      expect(() =>
        validate({ NODE_ENV: env, PAYMENT_PROVIDER: "mock" }),
      ).not.toThrow();
    }
  });

  it("refuses to boot on an unrecognized PAYMENT_PROVIDER value", () => {
    expect(() =>
      validate({ NODE_ENV: "development", PAYMENT_PROVIDER: "stripe" }),
    ).toThrow(/PAYMENT_PROVIDER must be one of/);
  });

  it("refuses to boot with PAYMENT_PROVIDER=mock (or unset) in production", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://x",
      REDIS_URL: "redis://x",
      WEBHOOK_SECRET: "prod-webhook-secret",
      JWT_SECRET: "prod-jwt-secret",
    };
    expect(() => validate({ ...base })).toThrow(
      /PAYMENT_PROVIDER=mock \(or unset\) is not allowed in production/,
    );
    expect(() => validate({ ...base, PAYMENT_PROVIDER: "mock" })).toThrow(
      /PAYMENT_PROVIDER=mock \(or unset\) is not allowed in production/,
    );
  });

  it.each(VALID_PAYMENT_PROVIDERS.filter((provider) => provider !== "mock"))(
    "accepts the recognized-but-not-yet-implemented provider %s as a value (adapter absence is a registry-level 404, not a boot refusal)",
    (provider) => {
      expect(() =>
        validate({ NODE_ENV: "development", PAYMENT_PROVIDER: provider }),
      ).not.toThrow();
    },
  );
});

describe("env.validation — PUSH_PROVIDER enumeration + prod-mock refusal (Task 7)", () => {
  it("accepts PUSH_PROVIDER unset in development (defaults to mock)", () => {
    expect(() => validate({ NODE_ENV: "development" })).not.toThrow();
  });

  it("accepts PUSH_PROVIDER=mock explicitly in development/test/staging", () => {
    for (const env of ["development", "test", "staging"] as const) {
      expect(() =>
        validate({ NODE_ENV: env, PUSH_PROVIDER: "mock" }),
      ).not.toThrow();
    }
  });

  it("refuses to boot on an unrecognized PUSH_PROVIDER value", () => {
    expect(() =>
      validate({ NODE_ENV: "development", PUSH_PROVIDER: "fcm" }),
    ).toThrow(/PUSH_PROVIDER must be one of/);
  });

  it("refuses to boot with PUSH_PROVIDER=mock (or unset) in production", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://x",
      REDIS_URL: "redis://x",
      WEBHOOK_SECRET: "prod-webhook-secret",
      JWT_SECRET: "prod-jwt-secret",
      PAYMENT_PROVIDER: "iyzico",
    };
    expect(() => validate({ ...base })).toThrow(
      /PUSH_PROVIDER=mock \(or unset\) is not allowed in production/,
    );
    expect(() => validate({ ...base, PUSH_PROVIDER: "mock" })).toThrow(
      /PUSH_PROVIDER=mock \(or unset\) is not allowed in production/,
    );
  });

  it.each(VALID_PUSH_PROVIDERS.filter((provider) => provider !== "mock"))(
    "accepts the recognized provider %s as a value in production",
    (provider) => {
      expect(() =>
        validate({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://x",
          REDIS_URL: "redis://x",
          WEBHOOK_SECRET: "prod-webhook-secret",
          JWT_SECRET: "prod-jwt-secret",
          PAYMENT_PROVIDER: "iyzico",
          PUSH_PROVIDER: provider,
        }),
      ).not.toThrow();
    },
  );
});
