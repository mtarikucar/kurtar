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

// The redeem screen's two device concessions (src/lib/parlaklik.ts). Both
// are native-only and have no JS behaviour under Jest; left unmocked they
// leave an unsettled promise on the native-module proxy for every test
// that mounts the screen.
jest.mock("expo-brightness", () => ({
  getBrightnessAsync: jest.fn(() => Promise.resolve(0.5)),
  setBrightnessAsync: jest.fn(() => Promise.resolve()),
  restoreSystemBrightnessAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
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

// react-native-maps and supercluster are only ever imported by
// MapPane.native.tsx, which no spec below imports directly (Discover
// screen tests exercise the list view path — see the report's coverage
// notes for what native map rendering could NOT be exercised in this
// Node/jsdom environment).
