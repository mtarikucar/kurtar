import { AccessibilityInfo } from "react-native";

/**
 * Pins the platform's reduce-motion answer for one test.
 *
 * Deliberately NOT `jest.spyOn(...).mockRestore()`: under jest-expo the
 * react-native module's own methods are already `jest.fn()`s WITH
 * implementations, and `mockRestore` on a spy over a mock strips that
 * implementation — leaving `isReduceMotionEnabled()` returning undefined
 * for every later test in the file, which surfaces as an opaque
 * AggregateError from React three describes down. Capturing and putting
 * back the original reference has none of that behaviour.
 */
export function erisimAzaltmayiAyarla(azalt: boolean): () => void {
  const oncekiOku = AccessibilityInfo.isReduceMotionEnabled;
  const oncekiAbone = AccessibilityInfo.addEventListener;

  AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.resolve(azalt));
  AccessibilityInfo.addEventListener = jest.fn(() => ({
    remove: jest.fn(),
  })) as unknown as typeof AccessibilityInfo.addEventListener;

  return () => {
    AccessibilityInfo.isReduceMotionEnabled = oncekiOku;
    AccessibilityInfo.addEventListener = oncekiAbone;
  };
}
