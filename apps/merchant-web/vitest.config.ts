import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts (which carries load-bearing dev/prod-build
// comments from Task 9.5's workspace wiring) so the test runner's config
// never risks disturbing that file. Mirrors its one setting that matters
// here too: preserveSymlinks, for the same npm-workspace-symlink reason
// (see vite.config.ts's comment) — without it Vitest's module resolution
// for @kurtar/api-client / @kurtar/ui-tokens can behave differently from
// the dev server's.
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
