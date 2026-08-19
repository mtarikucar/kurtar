/**
 * [Task 9.5] The four frontend dev servers' fixed origins (see
 * docs/frontend-contract.md's port table) — apps/merchant-web (Vite,
 * 5173), apps/admin-web (Vite, 5174), landing (Next, 3000), apps/consumer
 * (Expo web preview, 8081). Used ONLY as the local-development default
 * below; no deployed environment ever falls back to this list.
 */
export const DEV_DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8081",
];

/**
 * [Task 9.5] Additive CORS wiring for the four frontend surfaces — this
 * codebase had NO CORS middleware at all before this (every prior caller
 * was either same-origin or a non-browser client). `X-Client-Transport:
 * cookie` (apps/merchant-web, apps/admin-web — see auth.controller.ts)
 * relies on the browser sending/receiving the httpOnly refresh cookie
 * cross-origin, which requires `credentials: true` AND the origin echoed
 * back verbatim (never `*`, which `credentials: true` forbids by the CORS
 * spec).
 *
 * `CORS_ALLOWED_ORIGINS` (comma-separated) is the explicit, always-safe
 * override for any environment, including production. With it unset,
 * ONLY a local environment falls back to the dev origins above; every
 * DEPLOYED environment — staging as much as production — gets no CORS at
 * all, i.e. exactly the pre-Task-9.5 behavior (same-origin/non-browser
 * only). A real deployment must set CORS_ALLOWED_ORIGINS explicitly (e.g.
 * to the merchant/admin/landing domains) before any of those origins can
 * call the API from a browser.
 *
 * Lives in its own module rather than inside main.ts so it can be tested:
 * main.ts calls `bootstrap()` at module scope, so importing it from a
 * spec would try to start a real Nest application.
 */
export function resolveCorsOrigins(): string[] | undefined {
  const explicit = process.env.CORS_ALLOWED_ORIGINS;
  if (explicit && explicit.trim().length > 0) {
    return explicit
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  // Local only — NOT `!== "production"`. `staging` is a validated
  // NODE_ENV (env.validation.ts's VALID_NODE_ENVS) and a real deployment
  // target, and the old test handed it a credentialed localhost
  // allowlist: the tester's browser blocked every XHR from the real
  // staging panel origin while four localhost origins were trusted.
  const nodeEnv = process.env.NODE_ENV;
  if (
    nodeEnv === "development" ||
    nodeEnv === "test" ||
    nodeEnv === undefined
  ) {
    return DEV_DEFAULT_CORS_ORIGINS;
  }
  return undefined;
}
