import { describe, it, expect } from "vitest";
import { ImpactCounter } from "@/components/ImpactCounter";
import { extractText } from "./react-element-text";

const labels = {
  mealsSaved: "Bags rescued",
  co2eAvoided: "CO2e avoided",
  moneySaved: "Saved by consumers",
  unavailableTitle: "Live counter unavailable",
  unavailableBody: "Try again shortly.",
};

/**
 * `ImpactCounter` is a plain, hookless function component — see
 * test/react-element-text.ts's doc comment for why these tests call it
 * directly and walk the returned element tree instead of using
 * `@testing-library/react`'s `render()` (a real, environment-level
 * React-version-duplication issue in this workspace, unrelated to this
 * component's own correctness).
 */
describe("ImpactCounter", () => {
  it("renders the unavailable fallback, without throwing, when the API is down", () => {
    let tree: ReturnType<typeof ImpactCounter> | undefined;
    expect(() => {
      tree = ImpactCounter({ data: { status: "unavailable" }, locale: "en", labels });
    }).not.toThrow();

    const text = extractText(tree).join(" ");
    expect(text).toContain(labels.unavailableTitle);
    expect(text).toContain(labels.unavailableBody);
    // The fallback must not fabricate a number.
    expect(text).not.toMatch(/\d/);
  });

  it("renders real, formatted figures when data is available", () => {
    const tree = ImpactCounter({
      data: { status: "ok", mealsSaved: 1234, co2eGrams: 567000, moneySavedCents: 890000 },
      locale: "en",
      labels,
    });

    const text = extractText(tree).join(" ");
    expect(text).toContain("1,234");
    expect(text).toContain(labels.mealsSaved);
    expect(text).toContain(labels.co2eAvoided);
    expect(text).toContain(labels.moneySaved);
  });

  it("formats figures with Turkish locale conventions when locale is tr", () => {
    const tree = ImpactCounter({
      data: { status: "ok", mealsSaved: 1234, co2eGrams: 567000, moneySavedCents: 890000 },
      locale: "tr",
      labels,
    });

    // tr-TR thousands separator is a dot, not a comma.
    const text = extractText(tree).join(" ");
    expect(text).toContain("1.234");
  });
});
