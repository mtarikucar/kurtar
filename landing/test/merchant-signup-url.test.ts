import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MERCHANT_SIGNUP_URL } from "../lib/site-config";

/**
 * [I10 fix] Regression guard for the broken supply-side funnel: landing
 * cannot import apps/merchant-web/src/routes.ts as a module (no package
 * dependency between the two workspaces), so this reads it as a file and
 * asserts MERCHANT_SIGNUP_URL's path actually matches ROUTES.signup —
 * the same anti-drift pattern palette-parity.test.ts uses for a
 * different cross-workspace value. Without this, a route rename on
 * either side can silently break every "list your business" CTA on
 * landing again, exactly like the /signup-vs-/kayit mismatch this fixes.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("MERCHANT_SIGNUP_URL points at a route apps/merchant-web actually has", () => {
  it("the URL's path matches ROUTES.signup in apps/merchant-web/src/routes.ts", () => {
    const routesSource = fs.readFileSync(
      path.join(REPO_ROOT, "apps/merchant-web/src/routes.ts"),
      "utf8",
    );
    const match = routesSource.match(/signup:\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    const realSignupPath = match![1];

    expect(realSignupPath).toBe("/kayit");
    expect(MERCHANT_SIGNUP_URL.endsWith(realSignupPath)).toBe(true);
  });

  it("is not the old broken /signup path", () => {
    expect(MERCHANT_SIGNUP_URL.endsWith("/signup")).toBe(false);
  });
});
