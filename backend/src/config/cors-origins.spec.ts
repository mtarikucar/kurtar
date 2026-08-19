import { DEV_DEFAULT_CORS_ORIGINS, resolveCorsOrigins } from "./cors-origins";

/**
 * [M1] `staging` is a validated NODE_ENV (env.validation.ts's
 * VALID_NODE_ENVS) and a real deployment target
 * (ops/docker-compose.staging.yml). The fallback used to be keyed off
 * `!== "production"`, so a staging box with CORS_ALLOWED_ORIGINS unset
 * answered every browser preflight with a CREDENTIALED allowlist of four
 * localhost origins: the real staging panels were refused, so the app
 * looked dead to the tester, while localhost was trusted.
 *
 * The rule the doc comment always claimed, and now the rule the code
 * implements: only a LOCAL environment gets a fallback.
 */
describe("resolveCorsOrigins", () => {
  const onceki = { ...process.env };

  afterEach(() => {
    process.env = { ...onceki };
  });

  function ayarla(env: {
    NODE_ENV?: string;
    CORS_ALLOWED_ORIGINS?: string;
  }): void {
    delete process.env.NODE_ENV;
    delete process.env.CORS_ALLOWED_ORIGINS;
    Object.assign(process.env, env);
  }

  it.each(["development", "test"])(
    "falls back to the dev servers' origins in %s",
    (nodeEnv) => {
      ayarla({ NODE_ENV: nodeEnv });
      expect(resolveCorsOrigins()).toEqual(DEV_DEFAULT_CORS_ORIGINS);
    },
  );

  it.each(["staging", "production"])(
    "enables NO cors in %s when CORS_ALLOWED_ORIGINS is unset",
    (nodeEnv) => {
      ayarla({ NODE_ENV: nodeEnv });
      expect(resolveCorsOrigins()).toBeUndefined();
    },
  );

  it("never hands a deployed environment the localhost allowlist", () => {
    ayarla({ NODE_ENV: "staging" });
    expect(resolveCorsOrigins() ?? []).not.toContain("http://localhost:5174");
  });

  it("honours an explicit allowlist in every environment", () => {
    for (const nodeEnv of ["development", "test", "staging", "production"]) {
      ayarla({
        NODE_ENV: nodeEnv,
        CORS_ALLOWED_ORIGINS:
          "https://panel.kurtar.app, https://admin.kurtar.app",
      });
      expect(resolveCorsOrigins()).toEqual([
        "https://panel.kurtar.app",
        "https://admin.kurtar.app",
      ]);
    }
  });

  it("treats a blank allowlist as unset rather than as an empty allowlist", () => {
    ayarla({ NODE_ENV: "staging", CORS_ALLOWED_ORIGINS: "   " });
    expect(resolveCorsOrigins()).toBeUndefined();
  });
});
