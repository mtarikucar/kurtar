import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        // By default Vitest resolves third-party node_modules packages
        // via plain Node resolution ("externalized"), bypassing Vite's
        // bundler-level `resolve.alias` entirely — which is exactly why
        // the next/navigation and next/link aliases below were silently
        // ignored until this was added. Forcing next-intl (and next
        // itself, which next-intl imports) through Vite's own transform
        // pipeline is what makes those aliases actually take effect.
        inline: [/next-intl/, "next"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // next-intl's client navigation bindings (i18n/navigation.ts's
      // createNavigation, which lib/seo.ts's getPathname and
      // components/LocaleSwitcher.tsx both use) import bare "next/navigation"
      // and "next/link" with no file extension. Next.js's own bundler
      // (webpack/Turbopack) resolves that fine — proven by `next build`
      // succeeding — but `next`'s package.json declares no "exports" map,
      // so plain Node ESM resolution (what Vite/Vitest uses outside Next's
      // own bundler) requires an explicit extension for a package-internal
      // subpath. Aliasing straight to the real files is test-tooling-only;
      // no application code changes.
      "next/navigation": path.resolve(__dirname, "../node_modules/next/navigation.js"),
      "next/link": path.resolve(__dirname, "../node_modules/next/link.js"),
    },
  },
});
