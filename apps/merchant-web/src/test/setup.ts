import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
// Every screen renders through react-i18next's `t(...)` — without
// initializing the real i18n instance here, every test would see raw
// translation keys instead of Turkish text.
import "../i18n";

// vitest.config.ts does not set `test.globals: true` (every test file
// imports describe/it/expect/vi explicitly instead), so Testing Library's
// automatic per-test cleanup — which only self-registers when it finds a
// GLOBAL `afterEach` — never fires on its own. Without this, every
// `render()` in a test file accumulates in the same jsdom `document.body`
// across tests, which is exactly what produced "found multiple elements"
// failures in the second+ test of any file with more than one `render()`.
afterEach(() => {
  cleanup();
});
