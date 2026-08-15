import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      getDashboard: vi.fn(async () => ({
        pendingMerchantApprovals: 3,
        openComplaints: 0,
        complaintsSlaAtRisk: 2,
        openReports: 0,
        settlementBatchesNeedingAttention: 1,
        today: { gmvCents: 1_250_000, redeemedCount: 42 },
      })),
      complaints: {
        list: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
        })),
      },
      reports: {
        list: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 5,
        })),
      },
      settlements: {
        list: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 5,
        })),
      },
    },
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage — urgency signalling", () => {
  it("flags every nonzero urgency tile as urgent and links it to its own filtered queue", async () => {
    renderPage();

    const pendingApprovals = await screen.findByText("3");
    const pendingLink = pendingApprovals.closest("a");
    expect(pendingLink).toHaveAttribute("href", "/merchants?status=PENDING");
    // A urgent tile is marked through more than colour — see StatCard's
    // own urgent styling doc comment (thicker, distinctly-coloured border
    // is a separate CSS signal on top of colour, not a replacement).
    expect(pendingLink?.className).toMatch(/urgent/);

    const atRisk = screen.getByText("2");
    expect(atRisk.closest("a")).toHaveAttribute(
      "href",
      "/complaints?status=AT_RISK",
    );
    expect(atRisk.closest("a")?.className).toMatch(/urgent/);

    const needsAttention = screen.getByText("1");
    expect(needsAttention.closest("a")).toHaveAttribute(
      "href",
      "/settlements?status=NEEDS_ATTENTION",
    );
  });

  it("does NOT mark a zero-count tile as urgent", async () => {
    renderPage();
    await screen.findByText("3");
    // Both openComplaints and openReports are 0 in this fixture — find the
    // specific tile by its link target rather than by ambiguous "0" text.
    const reportsLink = document.querySelector(
      'a[href="/moderation?status=OPEN"]',
    );
    expect(reportsLink).not.toBeNull();
    expect(reportsLink?.textContent).toContain("0");
    expect(reportsLink?.className).not.toMatch(/urgent/);
  });

  it("renders today's GMV as a formatted Turkish Lira amount, not raw kuruş", async () => {
    renderPage();
    await screen.findByText("3");
    expect(screen.getByText(/12\.500,00/)).toBeInTheDocument();
  });
});
