import { describe, it, expect } from "vitest";
import tr from "@/messages/tr.json";
import en from "@/messages/en.json";

/** Recursively collects every leaf key path ("a.b.c") in a nested message object. */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  const entries = Object.entries(obj as Record<string, unknown>);
  return entries.flatMap(([key, value]) =>
    collectKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n message parity (tr / en)", () => {
  it("both locale files declare exactly the same set of keys", () => {
    const trKeys = new Set(collectKeyPaths(tr));
    const enKeys = new Set(collectKeyPaths(en));

    const onlyInTr = [...trKeys].filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !trKeys.has(k));

    expect(onlyInTr, `keys present in tr.json but missing from en.json: ${onlyInTr.join(", ")}`).toEqual([]);
    expect(onlyInEn, `keys present in en.json but missing from tr.json: ${onlyInEn.join(", ")}`).toEqual([]);
  });

  it("no message string is empty in either locale", () => {
    for (const [locale, messages] of [["tr", tr] as const, ["en", en] as const]) {
      const empties = collectKeyPaths(messages).filter((path) => {
        const value = path.split(".").reduce<unknown>((acc, key) => {
          if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
          return undefined;
        }, messages);
        return typeof value === "string" && value.trim().length === 0;
      });
      expect(empties, `empty string values in ${locale}.json: ${empties.join(", ")}`).toEqual([]);
    }
  });

  it("arrays declared via t.raw() (steps, faq items, etc.) have the same length in both locales", () => {
    const arrayPaths: [unknown[], unknown[], string][] = [
      [tr.home.howItWorks.steps, en.home.howItWorks.steps, "home.howItWorks.steps"],
      [tr.howItWorks.steps.items, en.howItWorks.steps.items, "howItWorks.steps.items"],
      [tr.howItWorks.honesty.items, en.howItWorks.honesty.items, "howItWorks.honesty.items"],
      [tr.merchants.howItWorksForMerchants.steps, en.merchants.howItWorksForMerchants.steps, "merchants.howItWorksForMerchants.steps"],
      [tr.merchants.faq.items, en.merchants.faq.items, "merchants.faq.items"],
    ];
    for (const [trArr, enArr, label] of arrayPaths) {
      expect(trArr.length, `${label} length mismatch`).toBe(enArr.length);
    }
  });
});
