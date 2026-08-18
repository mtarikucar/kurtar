import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * [M9 fix] Both formatDate/formatDateTime doc comments claim
 * Europe/Istanbul, but until this fix neither `Intl.DateTimeFormat` call
 * pinned `timeZone` — the `tr-TR` locale controls script/digit/calendar
 * conventions, never the zone, so both silently rendered in whatever
 * timezone the OPERATOR'S machine happened to be set to. This test
 * proves the pin actually holds by constructing the module under two
 * different process timezones and asserting identical output for the
 * same instant — a real regression (removing `timeZone:
 * "Europe/Istanbul"`) makes this fail, not just look wrong in a screenshot.
 */
describe("date.ts — pinned to Europe/Istanbul regardless of the viewer's local timezone (M9)", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    vi.resetModules();
  });

  it("formatDateTime renders the same Istanbul wall-clock time under a different process TZ", async () => {
    // 2026-08-15T21:30:00Z is 00:30 on the 16th in Istanbul (UTC+3) but
    // still 17:30 on the 15th in New York (UTC-4 in August, DST) — a
    // timezone-pinning bug would make these two renders disagree on the
    // DAY, not just the hour.
    const iso = "2026-08-15T21:30:00.000Z";

    process.env.TZ = "Europe/Istanbul";
    vi.resetModules();
    const { formatDateTime: formatUnderIstanbulProcessTz } =
      await import("./date");
    const istanbulRendering = formatUnderIstanbulProcessTz(iso);

    process.env.TZ = "America/New_York";
    vi.resetModules();
    const { formatDateTime: formatUnderNewYorkProcessTz } =
      await import("./date");
    const newYorkProcessRendering = formatUnderNewYorkProcessTz(iso);

    expect(newYorkProcessRendering).toBe(istanbulRendering);
    // Concretely: must say the 16th (Istanbul's date for this instant),
    // never the 15th (what an unpinned formatter would show under a
    // New-York-zoned process).
    expect(newYorkProcessRendering).toContain("16");
  });

  it("formatDate renders the same Istanbul calendar date under a different process TZ", async () => {
    const iso = "2026-08-15T21:30:00.000Z";

    process.env.TZ = "Europe/Istanbul";
    vi.resetModules();
    const { formatDate: formatUnderIstanbulProcessTz } = await import("./date");
    const istanbulRendering = formatUnderIstanbulProcessTz(iso);

    process.env.TZ = "America/New_York";
    vi.resetModules();
    const { formatDate: formatUnderNewYorkProcessTz } = await import("./date");
    const newYorkProcessRendering = formatUnderNewYorkProcessTz(iso);

    expect(newYorkProcessRendering).toBe(istanbulRendering);
    expect(newYorkProcessRendering).toContain("16");
  });
});
