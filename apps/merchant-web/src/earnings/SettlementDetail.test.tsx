import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KurtarClient } from "@kurtar/api-client";
import type { SettlementDetail as SettlementDetailShape } from "../api/response-types";
import { SettlementDetail } from "./SettlementDetail";

const getSettlementMine = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    settlements: {
      getMine: (...args: unknown[]) => getSettlementMine(...args),
    },
  } as unknown as KurtarClient,
}));

function renderDetail(batchId = "batch-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettlementDetail batchId={batchId} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

const BASE_BATCH: SettlementDetailShape = {
  id: "batch-1",
  merchantId: "m1",
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-08-07T00:00:00.000Z",
  status: "SETTLED",
  grossCents: 10000,
  bagFeeCents: 500,
  bagFeeVatCents: 100,
  withholdingCents: 95,
  membershipOffsetCents: 200,
  membershipOffsetVatCents: 0,
  refundClawbackCents: 0,
  netPayoutCents: 9105,
  carriedShortfallCents: 0,
  carriedExternalDemandCents: 0,
  inheritedExternalDemandCents: 0,
  shortfallResolvedAt: null,
  payoutAttemptedAt: null,
  holdReason: null,
  dueAt: "2026-08-14T00:00:00.000Z",
  pspTransferRef: null,
  sentAt: null,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  carriedDemandSourceBatchId: null,
  settlementLines: [
    {
      id: "line-1",
      batchId: "batch-1",
      reservationId: "res-1",
      redeemedAt: "2026-08-02T18:00:00.000Z",
      grossCents: 10000,
      bagFeeCents: 500,
      bagFeeVatCents: 100,
      withholdingCents: 95,
      clawbackCents: 0,
      clawbackAppliedAt: null,
      clawbackBatchId: null,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    },
  ],
  commissionInvoices: [],
};

describe("SettlementDetail — the earnings breakdown arithmetic", () => {
  beforeEach(() => getSettlementMine.mockReset());

  it("renders gross, every applied deduction, and net so they read the same as the server's own numbers", async () => {
    getSettlementMine.mockResolvedValue(BASE_BATCH);
    renderDetail();

    // gross
    await waitFor(() =>
      expect(screen.getByText("₺100,00")).toBeInTheDocument(),
    );
    // bag fee ₺5,00, its KDV ₺1,00, withholding ₺0,95, membership offset ₺2,00
    expect(screen.getByText("−₺5,00")).toBeInTheDocument();
    expect(screen.getByText("−₺1,00")).toBeInTheDocument();
    expect(screen.getByText("−₺0,95")).toBeInTheDocument();
    expect(screen.getByText("−₺2,00")).toBeInTheDocument();
    // net = gross - bagFee - bagFeeVat - withholding - membershipOffset
    //     = 10000 - 500 - 100 - 95 - 200 = 9105 kuruş = ₺91,05
    expect(screen.getByText("₺91,05")).toBeInTheDocument();

    // deductions that did NOT apply this period are omitted, not shown as ₺0,00
    expect(screen.queryByText(/İade geri talebi/)).not.toBeInTheDocument();
    // not HELD — no held explanation banner
    expect(screen.queryByText(/beklemede/)).not.toBeInTheDocument();
  });

  it("shows the HELD explanation and the carried-forward amount when the batch could not fully pay out", async () => {
    getSettlementMine.mockResolvedValue({
      ...BASE_BATCH,
      status: "HELD",
      netPayoutCents: 0,
      carriedShortfallCents: 350,
      holdReason: "negative net, ₺3,50 carried",
    });
    renderDetail();

    await waitFor(() =>
      expect(
        screen.getByText(
          "Bu dönem beklemede — brüt tutar, kesintileri karşılamaya yetmedi. Fark bir sonraki döneme devrediyor.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("₺3,50")).toBeInTheDocument(); // carried shortfall
  });
});
