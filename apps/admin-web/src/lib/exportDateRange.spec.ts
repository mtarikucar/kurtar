import { describe, expect, it } from "vitest";
import { validateExportDateRange } from "./exportDateRange";

describe("validateExportDateRange", () => {
  it("requires a from date", () => {
    expect(validateExportDateRange("", "2026-08-01")).toBe("MISSING_FROM");
  });

  it("requires a to date", () => {
    expect(validateExportDateRange("2026-08-01", "")).toBe("MISSING_TO");
  });

  it("rejects a from date after the to date", () => {
    expect(validateExportDateRange("2026-08-10", "2026-08-01")).toBe(
      "FROM_AFTER_TO",
    );
  });

  it("accepts a valid range where from is before to", () => {
    expect(validateExportDateRange("2026-08-01", "2026-08-10")).toBeNull();
  });

  it("accepts a single-day range where from equals to", () => {
    expect(validateExportDateRange("2026-08-01", "2026-08-01")).toBeNull();
  });

  it("prioritizes MISSING_FROM over MISSING_TO when both are empty", () => {
    expect(validateExportDateRange("", "")).toBe("MISSING_FROM");
  });
});
