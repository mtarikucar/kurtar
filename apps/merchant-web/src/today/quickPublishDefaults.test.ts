import { beforeEach, describe, expect, it } from "vitest";
import {
  FALLBACK_DEFAULT,
  getLastTemplateId,
  getQuickPublishDefault,
  saveQuickPublishDefault,
} from "./quickPublishDefaults";

describe("quickPublishDefaults", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to a sensible generic default for a template never published before", () => {
    expect(getQuickPublishDefault("merchant-1", "template-1")).toEqual(
      FALLBACK_DEFAULT,
    );
  });

  it("remembers what was actually used for that template, per merchant", () => {
    saveQuickPublishDefault("merchant-1", "template-1", {
      qtyTotal: 12,
      startTime: "20:00",
      endTime: "22:00",
    });

    expect(getQuickPublishDefault("merchant-1", "template-1")).toEqual({
      qtyTotal: 12,
      startTime: "20:00",
      endTime: "22:00",
    });
    // A different template for the SAME merchant is untouched.
    expect(getQuickPublishDefault("merchant-1", "template-2")).toEqual(
      FALLBACK_DEFAULT,
    );
  });

  it("never leaks one merchant's remembered defaults into another's session", () => {
    saveQuickPublishDefault("merchant-1", "template-1", {
      qtyTotal: 12,
      startTime: "20:00",
      endTime: "22:00",
    });

    expect(getQuickPublishDefault("merchant-2", "template-1")).toEqual(
      FALLBACK_DEFAULT,
    );
  });

  it("tracks the last-used template so it can be preselected next time", () => {
    expect(getLastTemplateId("merchant-1")).toBeUndefined();

    saveQuickPublishDefault("merchant-1", "template-1", FALLBACK_DEFAULT);
    expect(getLastTemplateId("merchant-1")).toBe("template-1");

    saveQuickPublishDefault("merchant-1", "template-2", FALLBACK_DEFAULT);
    expect(getLastTemplateId("merchant-1")).toBe("template-2");
  });
});
