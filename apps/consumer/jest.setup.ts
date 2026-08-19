// Test-environment mocks for native modules with no meaningful JS behavior
// under Jest (no device, no filesystem-backed SecureStore, no real GPS/
// push infrastructure). Kept centralized here rather than per-spec so
// every test file gets the same baseline.

// TanStack Query batches subscriber notifications via a real
// `setTimeout(fn, 0)` (packages/@tanstack/query-core's notifyManager) —
// under RNTL v14's `waitFor` (a tight microtask polling loop for React 19),
// that macrotask never gets a turn to run, so a query's `isSuccess` flip
// never becomes observable and every `waitFor` on it times out at exactly
// waitFor's own ceiling. This is TanStack Query's own documented testing
// recommendation (https://tanstack.com/query/latest/docs/framework/react/guides/testing):
// make notifications synchronous in tests, so a state update from a
// resolved mock is visible on the very next render, no macrotask required.
import { notifyManager } from "@tanstack/react-query";
notifyManager.setNotifyFunction((fn) => fn());
notifyManager.setBatchNotifyFunction((fn) => fn());

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-location", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "undetermined" }),
  ),
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "denied" }),
  ),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 41.0, longitude: 29.0 } }),
  ),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "undetermined" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "denied" })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: "ExponentPushToken[test]" })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));


// The real package resolves to its NATIVE implementation under Jest's
// node/haste environment (expecting a real native bridge that doesn't
// exist here) — the package's own official Jest mock is an in-memory
// implementation built for exactly this. `require()` (not `import`) is
// required INSIDE the mock factory — jest.mock factories run in a
// restricted scope that only permits inline `require`.
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("react-native-webview", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return { WebView: (props: object) => React.createElement(View, props) };
});

// react-native-maps resolves to its native bridge under Jest's default
// (non-`.web`) platform resolution — with no real bridge in this Node/
// jsdom environment, `TurboModuleRegistry.getEnforcing` throws before any
// screen that mounts `MapPane.native.tsx` (Keşfet's collapsing header,
// the Harita tab) can even render. This stands in the plainest possible
// `View`s for `MapView`/`Marker`; the real native rendering (markers,
// clustering, the dark map style) is exercised by looking at the actual
// exported web/native builds, not by a Jest unit test — see the design
// build log's coverage notes.
jest.mock("react-native-maps", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const MapView = (props: { children?: React.ReactNode }) =>
    React.createElement(View, props, props.children);
  const Marker = (props: { children?: React.ReactNode }) =>
    React.createElement(View, props, props.children);
  return { __esModule: true, default: MapView, Marker, PROVIDER_GOOGLE: "google" };
});

// `supercluster` (MapPane.native.tsx's client-side pin clustering) ships
// ESM-only and sits outside jest-expo's `transformIgnorePatterns`
// allowlist (it's not an RN/Expo package) — Jest can't parse its `import`
// syntax at all. An empty cluster index is enough for a screen test: no
// spec here asserts on real cluster geometry.
jest.mock("supercluster", () => {
  class SahteSupercluster {
    load() {
      return this;
    }
    getClusters() {
      return [];
    }
    getClusterExpansionZoom(id: number) {
      return id;
    }
  }
  return { __esModule: true, default: SahteSupercluster };
});
