import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-surface E2E (Task 14) — the money loop, run against the REAL
 * backend + REAL Postgres/PostGIS/Redis + the BUILT merchant-web/admin-web
 * (never dev servers in CI; see docs/operations.md and the root README for
 * how this is wired into CI and how to run it locally). No mocks anywhere
 * in this suite: every HTTP call and every browser action hits the actual
 * running services this config points at.
 *
 * This project does NOT start those services itself (no `webServer`
 * entries) — orchestrating a Postgres+Redis-backed backend, two built SPAs,
 * migrations, and a demo-independent test fixture is the CI job's/
 * dev-up.sh's job, not this config's. See package.json's `test` script's
 * doc comment for the exact preconditions.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // one coherent money-loop story; nothing here benefits from parallelism
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
