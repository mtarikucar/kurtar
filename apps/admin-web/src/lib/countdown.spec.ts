import { describe, expect, it } from "vitest";
import {
  classifyDeadline,
  COMPLAINT_SLA_THRESHOLDS,
  REPORT_TAKEDOWN_THRESHOLDS,
  toCountdownParts,
  type DeadlineThresholds,
} from "./countdown";

const THRESHOLDS: DeadlineThresholds = {
  criticalMs: 3_600_000,
  warningMs: 7_200_000,
}; // 1h / 2h

describe("classifyDeadline", () => {
  it("classifies comfortably-safe remaining time as safe", () => {
    expect(classifyDeadline(THRESHOLDS.warningMs + 1, THRESHOLDS)).toBe("safe");
  });

  it("classifies the warning boundary (exactly warningMs remaining) as warning", () => {
    expect(classifyDeadline(THRESHOLDS.warningMs, THRESHOLDS)).toBe("warning");
  });

  it("classifies just inside the warning window as warning", () => {
    expect(classifyDeadline(THRESHOLDS.warningMs - 1, THRESHOLDS)).toBe(
      "warning",
    );
  });

  it("classifies the critical boundary (exactly criticalMs remaining) as critical", () => {
    expect(classifyDeadline(THRESHOLDS.criticalMs, THRESHOLDS)).toBe(
      "critical",
    );
  });

  it("classifies just inside the critical window as critical", () => {
    expect(classifyDeadline(THRESHOLDS.criticalMs - 1, THRESHOLDS)).toBe(
      "critical",
    );
  });

  it("classifies a single millisecond remaining as critical, not breached", () => {
    expect(classifyDeadline(1, THRESHOLDS)).toBe("critical");
  });

  it("classifies the EXACT deadline moment (msRemaining === 0) as breached", () => {
    // This is the boundary case the brief calls out explicitly — zero time
    // remaining on a legal deadline is already too late, not "critical".
    expect(classifyDeadline(0, THRESHOLDS)).toBe("breached");
  });

  it("classifies negative remaining time (past the deadline) as breached", () => {
    expect(classifyDeadline(-1, THRESHOLDS)).toBe("breached");
    expect(classifyDeadline(-1_000_000, THRESHOLDS)).toBe("breached");
  });

  it("is monotonic: urgency never decreases as remaining time decreases", () => {
    const order = ["safe", "warning", "critical", "breached"];
    const samples = [
      THRESHOLDS.warningMs + 10_000,
      THRESHOLDS.warningMs,
      THRESHOLDS.criticalMs,
      0,
      -10_000,
    ];
    const ranks = samples.map((ms) =>
      order.indexOf(classifyDeadline(ms, THRESHOLDS)),
    );
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });
});

describe("real product thresholds", () => {
  it("complaint warningMs matches the backend's own 48h SLA-at-risk window", () => {
    expect(COMPLAINT_SLA_THRESHOLDS.warningMs).toBe(48 * 60 * 60 * 1000);
  });

  it("report warningMs matches the backend's own 12h takedown-warning window", () => {
    expect(REPORT_TAKEDOWN_THRESHOLDS.warningMs).toBe(12 * 60 * 60 * 1000);
  });
});

describe("toCountdownParts", () => {
  it("breaks down a multi-day duration into whole days/hours/minutes", () => {
    // 2 days, 3 hours, 45 minutes
    const ms = 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 45 * 60 * 1000;
    expect(toCountdownParts(ms)).toEqual({ days: 2, hours: 3, minutes: 45 });
  });

  it("handles zero", () => {
    expect(toCountdownParts(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it("floors partial minutes", () => {
    expect(toCountdownParts(59_000)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
