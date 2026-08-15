import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
