import {
  computeNextAttemptDelayMs,
  MAX_OUTBOX_ATTEMPTS,
} from "./outbox-backoff";

describe("computeNextAttemptDelayMs", () => {
  it("doubles from a 30s base: 1->30s, 2->1m, 3->2m, 4->4m, 5->8m", () => {
    expect(computeNextAttemptDelayMs(1)).toBe(30_000);
    expect(computeNextAttemptDelayMs(2)).toBe(60_000);
    expect(computeNextAttemptDelayMs(3)).toBe(120_000);
    expect(computeNextAttemptDelayMs(4)).toBe(240_000);
    expect(computeNextAttemptDelayMs(5)).toBe(480_000);
  });

  it("caps at 30 minutes even for attempts far beyond the cap", () => {
    expect(computeNextAttemptDelayMs(10)).toBe(30 * 60_000);
    expect(computeNextAttemptDelayMs(50)).toBe(30 * 60_000);
  });

  it("treats attempts<=1 the same as attempts=1 (no negative exponent)", () => {
    expect(computeNextAttemptDelayMs(0)).toBe(30_000);
    expect(computeNextAttemptDelayMs(1)).toBe(30_000);
  });

  it("MAX_OUTBOX_ATTEMPTS is 6 (last retryable delay is the attempts=5 -> 8m step)", () => {
    expect(MAX_OUTBOX_ATTEMPTS).toBe(6);
  });
});
