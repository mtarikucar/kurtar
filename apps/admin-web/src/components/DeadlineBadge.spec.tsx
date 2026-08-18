import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "../i18n";
import { DeadlineBadge } from "./DeadlineBadge";
import type { DeadlineThresholds } from "../lib/countdown";

const THRESHOLDS: DeadlineThresholds = {
  criticalMs: 3_600_000,
  warningMs: 7_200_000,
};

describe("DeadlineBadge", () => {
  it("renders a safe countdown with the safe urgency marker", () => {
    render(
      <DeadlineBadge
        countdownMs={10 * 3_600_000}
        thresholds={THRESHOLDS}
        live
      />,
    );
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-urgency", "safe");
    expect(badge).toHaveTextContent("SÜRESİNDE");
  });

  it("renders a warning countdown at the exact warning boundary", () => {
    render(
      <DeadlineBadge
        countdownMs={THRESHOLDS.warningMs}
        thresholds={THRESHOLDS}
        live
      />,
    );
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-urgency",
      "warning",
    );
  });

  it("renders a critical countdown at the exact critical boundary", () => {
    render(
      <DeadlineBadge
        countdownMs={THRESHOLDS.criticalMs}
        thresholds={THRESHOLDS}
        live
      />,
    );
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-urgency",
      "critical",
    );
  });

  it("renders breached exactly AT the deadline instant (countdownMs === 0)", () => {
    render(<DeadlineBadge countdownMs={0} thresholds={THRESHOLDS} live />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-urgency", "breached");
    expect(badge).toHaveTextContent("SÜRESİ DOLDU");
  });

  it("renders breached for a deadline in the past", () => {
    render(
      <DeadlineBadge countdownMs={-3_600_000} thresholds={THRESHOLDS} live />,
    );
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-urgency",
      "breached",
    );
  });

  it("flags a breached deadline through text AND an icon glyph, not colour alone", () => {
    const { container } = render(
      <DeadlineBadge countdownMs={-1} thresholds={THRESHOLDS} live />,
    );
    // Non-colour signal #1: the urgency word is real, readable text.
    expect(screen.getByText("SÜRESİ DOLDU")).toBeInTheDocument();
    // Non-colour signal #2: a distinct icon glyph (aria-hidden, decorative,
    // but present in the DOM and DIFFERENT from the safe-state icon below).
    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).toHaveTextContent("✖");
  });

  it("uses a DIFFERENT icon glyph for safe vs. breached (not just a colour swap)", () => {
    const { container: safeContainer } = render(
      <DeadlineBadge
        countdownMs={10 * 3_600_000}
        thresholds={THRESHOLDS}
        live
      />,
    );
    const { container: breachedContainer } = render(
      <DeadlineBadge countdownMs={-1} thresholds={THRESHOLDS} live />,
    );
    const safeIcon = safeContainer.querySelector(
      '[aria-hidden="true"]',
    )?.textContent;
    const breachedIcon = breachedContainer.querySelector(
      '[aria-hidden="true"]',
    )?.textContent;
    expect(safeIcon).not.toBe(breachedIcon);
  });

  it("renders a multi-day remaining countdown with days and hours", () => {
    const twoDaysThreeHours = 2 * 24 * 3_600_000 + 3 * 3_600_000;
    render(
      <DeadlineBadge
        countdownMs={twoDaysThreeHours}
        thresholds={{ criticalMs: 0, warningMs: 0 }}
        live
      />,
    );
    expect(screen.getByText(/2 gün 3 saat kaldı/)).toBeInTheDocument();
  });

  it("renders a breached multi-day countdown as time-since, not time-until", () => {
    const twoDaysThreeHoursAgo = -(2 * 24 * 3_600_000 + 3 * 3_600_000);
    render(
      <DeadlineBadge
        countdownMs={twoDaysThreeHoursAgo}
        thresholds={THRESHOLDS}
        live
      />,
    );
    expect(
      screen.getByText(/2 gün 3 saat önce süresi doldu/),
    ).toBeInTheDocument();
  });

  // [M21 fix] A queue table renders one DeadlineBadge per row — an
  // unconditional `role="status"` on every one of them stood up ~20
  // simultaneous polite live regions on a single page render.
  describe("live region (M21)", () => {
    it("is NOT an aria-live region by default (list/table usage)", () => {
      render(<DeadlineBadge countdownMs={3_600_000} thresholds={THRESHOLDS} />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("IS an aria-live region when live is explicitly passed (standalone detail usage)", () => {
      render(
        <DeadlineBadge countdownMs={3_600_000} thresholds={THRESHOLDS} live />,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
