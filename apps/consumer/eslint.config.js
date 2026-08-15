// Minimal ESLint 9 flat config for this placeholder.
//
// Deliberately NOT using eslint-config-expo/flat (the generator's
// default): that package gets hoisted to the workspace ROOT's
// node_modules (nothing else in this npm workspace needs it), and it
// internally does `require('eslint/config')` — a call that resolves
// relative to ITS OWN location, finding the ROOT's eslint@8 install
// (used by every other workspace here: backend, packages/*, apps/
// merchant-web, apps/admin-web all pin eslint@8's legacy .eslintrc
// format) instead of this app's own nested eslint@9. eslint@8 has no
// `eslint/config` export, so loading eslint-config-expo throws before
// ESLint ever runs — a real, reproducible npm-workspaces +
// mixed-ESLint-major-version limitation (see docs/frontend-contract.md),
// not fixable from a config file alone (an npm `overrides` entry
// targeting the specific dependency chain was tried first and did not
// force the nested install npm's docs suggest it should, likely because
// `eslint` is a peerDependency of eslint-config-expo, not a regular one).
// Task 12 can revisit — either npm/eslint-config-expo resolve this
// upstream, or switch this one workspace to a tool with stricter
// per-package dependency isolation (e.g. pnpm).
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: ["dist/*", ".expo/*"],
  },
);
