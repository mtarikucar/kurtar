import { describe, it, expect, afterEach, vi } from "vitest";
import { buildDeepLinkHref } from "@/components/OfferAppOpener";
import { APP_LINKS } from "@/lib/site-config";

/**
 * [M4 fix] `androidPackageName` used to be a `.PLACEHOLDER`-suffixed
 * string that could never match apps/consumer's real declared package
 * (app.json's `expo.android.package`, "app.kurtar.consumer") — so the
 * Android `intent://` deep link this component builds would silently
 * fall through to the Play Store fallback for every Android visitor,
 * even one with the app installed.
 */
describe("buildDeepLinkHref — Android intent package matches the real installed app (M4)", () => {
  const originalUserAgent = window.navigator.userAgent;

  afterEach(() => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: originalUserAgent,
    });
  });

  it("the intent:// package= param is the real declared package, not a PLACEHOLDER that can never match an installed app", () => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
    });

    const href = buildDeepLinkHref("offer-1");

    expect(href.startsWith("intent://o/offer-1#Intent;")).toBe(true);
    expect(href).toContain(`package=${APP_LINKS.androidPackageName};`);
    expect(href).toContain("package=app.kurtar.consumer;");
    // The `package=` param specifically must be the real, installable
    // package — the still-placeholder Play Store *listing* URL (no store
    // listing exists yet) is out of scope for this fix and legitimately
    // stays a placeholder in the S.browser_fallback_url param.
    expect(APP_LINKS.androidPackageName).not.toContain("PLACEHOLDER");
  });

  it("falls back to the plain custom-scheme URL on non-Android", () => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });

    expect(buildDeepLinkHref("offer-1")).toBe("kurtar://o/offer-1");
  });
});
