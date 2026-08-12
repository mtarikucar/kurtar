import { ThrottlerOptions } from "@nestjs/throttler";

/**
 * Root throttler profiles. Port of kds's
 * backend/src/common/config/throttler.config.ts.
 *
 * Every per-route `@Throttle({ default: { ... } })` override targets the
 * throttler NAMED "default" — @nestjs/throttler resolves overrides per
 * registered throttler name, so a `default` profile MUST be registered or
 * every route-level override is silently inert (this bit kds in production
 * once — see that file's own history). The `default` profile below is
 * deliberately LOOSER than `long`, so registering it changes nothing
 * globally; its only purpose is to give route-level overrides (auth's
 * OTP/login/refresh endpoints) something live to bind to.
 */
export const THROTTLER_PROFILES: ThrottlerOptions[] = [
  {
    name: "short",
    ttl: 1000,
    limit: 10,
  },
  {
    name: "medium",
    ttl: 10000,
    limit: 50,
  },
  {
    name: "long",
    ttl: 60000,
    limit: 100,
  },
  {
    name: "default",
    ttl: 60000,
    limit: 300,
  },
];
