import type { RequestEngine } from "../engine";

export function createHealthDomain(engine: RequestEngine) {
  return {
    /** GET /health — liveness probe, @Public, no auth required. */
    check: () => engine.request("get", "/api/health"),
  };
}

export type HealthDomain = ReturnType<typeof createHealthDomain>;
