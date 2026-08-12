/**
 * Fail-fast environment validation, wired into ConfigModule.forRoot()'s
 * `validate` hook (see app.module.ts). Runs once at app bootstrap, before
 * any request is served.
 *
 * Policy:
 *  - NODE_ENV must be one of VALID_NODE_ENVS, always, in every deploy —
 *    missing or misspelled refuses to boot. This used to default silently
 *    to "development" when unset, which is exactly the gap a Task 3
 *    security review caught: several downstream security decisions read
 *    NODE_ENV directly (SmsService's mock-provider-in-production refusal,
 *    the refresh-token cookie's `secure` flag, and previously the OTP
 *    dev-code echo) — an operator who forgot to set NODE_ENV=production
 *    would silently get the DEVELOPMENT behavior for all of those in a
 *    real production deploy. Requiring an explicit, recognized value here
 *    closes that gap for every future NODE_ENV-gated decision, not just
 *    the ones found this round.
 *  - DATABASE_URL and REDIS_URL are required in production — a prod
 *    process without them cannot do anything useful, so we refuse to boot
 *    rather than surface the gap as a confusing first-request failure. In
 *    development/test/staging we allow them to be missing (later tasks
 *    may not need the DB yet) but log a clear warning so the gap isn't
 *    silent.
 *  - PAYMENT_PROVIDER (Task 4) extends this same enum-and-refuse pattern
 *    rather than living as an ad-hoc check inside the payments-core module
 *    (the way SmsService validates SMS_PROVIDER from inside its own
 *    constructor). Two things are enforced, at the exact same boot moment
 *    as the NODE_ENV check above:
 *      1. An unrecognized value refuses to boot, in every environment —
 *         mirrors the NODE_ENV enum check exactly.
 *      2. "mock" (the default when unset) refuses to boot in production —
 *         mirrors SmsService's mock-SMS-in-production refusal. The money
 *         path must never silently run against an in-memory fake provider
 *         in prod.
 *    A recognized-but-not-yet-implemented value (iyzico, paytr — no
 *    adapter exists yet) is intentionally NOT refused here: nothing in
 *    this module knows which provider ids currently have a registered
 *    adapter, and hand-maintaining that list here would be a second,
 *    driftable source of truth alongside payments-core's actual
 *    registrations. PaymentProviderRegistry.get() already throws a clear
 *    "Unknown payment provider" error the moment such a provider is
 *    actually dispatched to (modules/payments-core/payment-provider.registry.ts)
 *    — no adapter ever self-registers for an id nothing implements.
 */

export const VALID_NODE_ENVS = [
  "development",
  "test",
  "staging",
  "production",
] as const;
export type ValidNodeEnv = (typeof VALID_NODE_ENVS)[number];

const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "REDIS_URL"] as const;

export const VALID_PAYMENT_PROVIDERS = ["mock", "iyzico", "paytr"] as const;
export type ValidPaymentProvider = (typeof VALID_PAYMENT_PROVIDERS)[number];

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isValidNodeEnv(value: unknown): value is ValidNodeEnv {
  return (
    typeof value === "string" &&
    (VALID_NODE_ENVS as readonly string[]).includes(value)
  );
}

function isValidPaymentProvider(value: unknown): value is ValidPaymentProvider {
  return (
    typeof value === "string" &&
    (VALID_PAYMENT_PROVIDERS as readonly string[]).includes(value)
  );
}

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!isValidNodeEnv(config.NODE_ENV)) {
    throw new Error(
      `Refusing to boot: NODE_ENV must be one of ${VALID_NODE_ENVS.join(", ")} (got ${JSON.stringify(
        config.NODE_ENV,
      )}). A missing or misspelled NODE_ENV previously defaulted silently ` +
        `to development-like behavior for several security-sensitive checks ` +
        `(mock SMS provider allowed, non-secure refresh cookie) — set it explicitly.`,
    );
  }
  const nodeEnv = config.NODE_ENV;
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

  const rawPaymentProvider = config.PAYMENT_PROVIDER;
  if (
    !isBlank(rawPaymentProvider) &&
    !isValidPaymentProvider(rawPaymentProvider)
  ) {
    throw new Error(
      `Refusing to boot: PAYMENT_PROVIDER must be one of ${VALID_PAYMENT_PROVIDERS.join(", ")} (got ${JSON.stringify(
        rawPaymentProvider,
      )}).`,
    );
  }
  const paymentProvider: ValidPaymentProvider = isBlank(rawPaymentProvider)
    ? "mock"
    : (rawPaymentProvider as ValidPaymentProvider);

  if (paymentProvider === "mock" && isProduction) {
    throw new Error(
      "Refusing to boot: PAYMENT_PROVIDER=mock (or unset) is not allowed in " +
        "production. The mock provider is an in-memory fake with no real " +
        "settlement — configure PAYMENT_PROVIDER=iyzico or PAYMENT_PROVIDER=paytr " +
        "once that adapter is implemented.",
    );
  }

  return config;
}
