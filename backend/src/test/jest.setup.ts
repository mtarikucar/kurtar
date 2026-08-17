/**
 * [Fix round #3, HIGH] Global jest setup — registered via package.json's
 * `jest.setupFiles`, so this runs for EVERY test file, unit and realdb
 * alike, BEFORE that file's own module-scope code executes (setupFiles
 * run before the test framework itself is installed, ahead of any
 * `describe`/`it`/import-time side effect in the spec file).
 *
 * Fills in the two secrets that several eagerly-constructed providers
 * throw without, if — and only if — nothing has already supplied them:
 *   - WEBHOOK_SECRET: payments-core/adapters/mock-payment-provider.ts's
 *     constructor throws immediately without it. MockPaymentProvider is
 *     NOT lazy — it is constructed as part of the (@Global)
 *     PaymentsCoreModule the moment ANY module graph that imports it
 *     (directly or transitively) gets built, which includes the full
 *     AppModule.
 *   - JWT_SECRET: auth/strategies/jwt.strategy.ts's constructor throws
 *     immediately without it, for the same "fail fast at boot" reason
 *     (see that file's own doc comment) — also unconditionally
 *     constructed as part of AuthModule inside AppModule.
 *
 * WHY THIS EXISTS: locally, the repo-root `.env` (gitignored) has real
 * values for both, found via config/env-file.ts's `__dirname`-based walk
 * regardless of jest's cwd — so a spec that boots the real AppModule
 * (settlement-cron-registration.realdb.spec.ts) works locally by
 * accident. The CI `backend-realdb` job (.github/workflows/
 * quality-gates.yml) sets only DATABASE_URL/TEST_DATABASE_URL/REDIS_URL —
 * no `.env` file exists in that environment at all — so the exact same
 * spec would throw at `app.init()` in CI while staying green on every
 * contributor's own machine. Before this file existed, the ONLY thing
 * papering over this for JWT_SECRET specifically was
 * otp-attempt-increment.realdb.spec.ts unilaterally mutating
 * `process.env.JWT_SECRET` with no restore — which then "worked" for
 * every OTHER file in the same worker process purely by Jest's file
 * execution order, a fragile, order-dependent accident, not a guarantee.
 * This file is the single, deterministic, order-independent place that
 * makes the WHOLE suite CI-safe, not just one spec.
 *
 * `||=`-style fallback (not an unconditional overwrite): a real `.env`
 * value, when present, is left alone — this only fills the gap CI has
 * and local dev doesn't.
 */
process.env.WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET || "jest-suite-test-webhook-secret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "jest-suite-test-jwt-secret";
