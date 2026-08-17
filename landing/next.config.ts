import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Standalone output is what landing/Dockerfile copies into the runtime
  // stage — a minimal self-contained server (node server.js), not the
  // full node_modules tree.
  output: "standalone",
  // This is an npm workspace (root package-lock.json one level up) — set
  // explicitly so Next's file tracer doesn't have to guess the workspace
  // root (and doesn't warn about multiple lockfiles if one is ever found
  // higher up a developer's own filesystem).
  outputFileTracingRoot: path.join(__dirname, ".."),
  // The universal-link verification files (public/.well-known/apple-app-
  // site-association has no extension, so Next's static file server
  // would otherwise send it as application/octet-stream) — both iOS and
  // Android expect application/json, and Apple's own crawler is stricter
  // about this than most static-file consumers. Both files are still
  // placeholder content (site-config.ts's APP_LINKS doc comment) until
  // apps/consumer ships real Team ID / package name / cert fingerprint.
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

// Points at i18n/request.ts (the default location next-intl's plugin
// looks for when no path is passed) — wraps the config so every Server
// Component gets request-scoped locale/messages without a manual
// provider at every route.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
