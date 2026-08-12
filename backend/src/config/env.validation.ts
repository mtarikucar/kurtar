/**
 * Fail-fast environment validation, wired into ConfigModule.forRoot()'s
 * `validate` hook (see app.module.ts). Runs once at app bootstrap, before
 * any request is served.
 *
 * Policy: DATABASE_URL and REDIS_URL are required in production — a prod
 * process without them cannot do anything useful, so we refuse to boot
 * rather than surface the gap as a confusing first-request failure. In
 * development we allow them to be missing (later tasks may not need the
 * DB yet) but log a clear warning so the gap isn't silent.
 */

const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "REDIS_URL"] as const;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv =
    typeof config.NODE_ENV === "string" ? config.NODE_ENV : "development";
  const isProduction = nodeEnv === "production";

  const missing: string[] = [];

  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!isBlank(config[key])) continue;

    if (isProduction) {
      missing.push(key);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[env] ${key} is not set. Continuing because NODE_ENV=${nodeEnv}; this would refuse to boot in production.`,
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to boot: missing required environment variable(s) in production: ${missing.join(", ")}.`,
    );
  }

  return config;
}
