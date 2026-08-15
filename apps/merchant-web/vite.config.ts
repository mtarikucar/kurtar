import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port is FIXED, not left to Vite's "pick the next free one" fallback —
// backend/src/main.ts's CORS allowlist is keyed off this exact origin
// (http://localhost:5173). See docs/frontend-contract.md's port table.
export default defineConfig({
  plugins: [react()],
  // npm workspaces symlinks @kurtar/api-client and @kurtar/ui-tokens into
  // node_modules (-> ../../packages/*). Without preserveSymlinks, Vite/
  // Rollup resolves those to their REAL path outside node_modules/, which
  // makes Rollup's commonjs plugin (its default `include` only matches
  // paths containing "node_modules") skip transforming them — the prod
  // build then fails with "X is not exported by ... dist/index.js" even
  // though the dev server (esbuild-based) works fine. Keeping the
  // symlink path intact is the standard fix for this exact npm/pnpm
  // workspace + Vite footgun.
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
