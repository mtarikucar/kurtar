// Metro/Expo-in-npm-workspaces config — a known footgun (see docs/
// frontend-contract.md): by default Metro only watches this app's own
// directory and only resolves modules from ITS OWN node_modules, so it
// never sees `@kurtar/api-client` / `@kurtar/ui-tokens` (workspace
// packages that npm hoists/symlinks into the REPO ROOT's node_modules,
// not this app's). Pattern is Expo's own documented monorepo setup
// (https://docs.expo.dev/guides/monorepos/):
//   - watchFolders: also watch the whole workspace root, so Metro notices
//     changes in sibling packages, not just this app.
//   - nodeModulesPaths: resolve modules from BOTH this app's node_modules
//     AND the workspace root's, in that order.
//   - disableHierarchicalLookup: stop Metro's default walk-up-the-tree
//     node_modules search, which would otherwise let it silently find a
//     DIFFERENT copy of a dependency higher up the filesystem than the one
//     npm workspaces actually resolved — the two paths above already cover
//     every real location a module can live in this monorepo.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
