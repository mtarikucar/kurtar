import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vite.config.ts's `test.globals` is deliberately left unset (this app
// doesn't inject Jest-style ambient test globals) — @testing-library/
// react's automatic post-test DOM cleanup detects `afterEach` as a
// GLOBAL, which is only present when `test.globals: true`. Without that,
// every render() in a file accumulates in `document.body` across tests
// instead of being unmounted, which is exactly why this is wired
// explicitly here rather than relying on the auto-registration.
afterEach(() => {
  cleanup();
});
