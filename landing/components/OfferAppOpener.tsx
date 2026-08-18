"use client";

import { useEffect, useState } from "react";
import { APP_LINKS } from "@/lib/site-config";

interface OfferAppOpenerProps {
  offerId: string;
  labels: {
    openingApp: string;
    noApp: string;
  };
}

/**
 * Builds the platform-appropriate deep-link target. iOS: a plain custom
 * URL scheme (once apps/consumer registers a real Universal Link domain
 * association — public/.well-known/apple-app-site-association — iOS
 * intercepts the ORIGINAL https:// share link at the OS level before this
 * page ever loads for a user who has the app installed, so this branch is
 * really the fallback path: no app, or association not yet verified).
 * Android: the documented `intent://` syntax (task-13 brief: "Android
 * intent handling") with `S.browser_fallback_url` pointing at the
 * Play Store placeholder — Chrome on Android opens the app if the
 * package below is installed and handles the scheme, otherwise it
 * follows the fallback URL itself, no JS timeout race needed on that
 * platform.
 */
export function buildDeepLinkHref(offerId: string): string {
  const isAndroid = /Android/i.test(window.navigator.userAgent);
  if (isAndroid) {
    const fallback = encodeURIComponent(APP_LINKS.androidPlayStoreUrl);
    return `intent://o/${offerId}#Intent;scheme=${APP_LINKS.deepLinkScheme};package=${APP_LINKS.androidPackageName};S.browser_fallback_url=${fallback};end`;
  }
  return `${APP_LINKS.deepLinkScheme}://o/${offerId}`;
}

/**
 * The one genuinely client-side piece of the /o/[id] universal-link
 * bridge (task-13 brief: "opens the app if installed, otherwise a
 * preview page with a store link and app CTAs") — attempting a deep
 * link is inherently a browser action, not something a Server Component
 * can do. Everything else on that page (headline, store badges, "keep
 * browsing" link) is static and renders without this component ever
 * running, so a crawler or a JS-disabled browser still gets a complete,
 * useful page — this only adds the "try to hand off to the app" behavior
 * on top.
 */
export function OfferAppOpener({ offerId, labels }: OfferAppOpenerProps) {
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = buildDeepLinkHref(offerId);
      setAttempted(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [offerId]);

  return (
    <p role="status" style={{ marginTop: "var(--space-lg)", color: "var(--color-ink-soft)" }}>
      {attempted ? labels.noApp : labels.openingApp}
    </p>
  );
}
