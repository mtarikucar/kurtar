import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KurtarClient } from "@kurtar/api-client";
import "../../i18n";
import { MerchantActionDialog } from "./MerchantActionDialog";
import type { AdminMerchantDetail } from "../../api/admin-types";

const getMerchantDetail = vi.fn();

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      merchants: {
        get: (...args: unknown[]) => getMerchantDetail(...args),
      },
    },
  } as unknown as KurtarClient,
}));

const KYC_DETAIL: AdminMerchantDetail = {
  id: "merchant-1",
  legalName: "Ada Fırın Gıda Ltd. Şti.",
  tradeName: "Ada Fırın",
  taxId: "1234567890",
  mersisNo: null,
  kepAddress: null,
  iban: "TR330006100519786457841326",
  verificationStatus: "SUBMITTED",
  verifiedAt: null,
  nextReverifyAt: null,
  sttAttestationAcceptedAt: "2026-08-01T00:00:00.000Z",
  intermediationAcceptedAt: "2026-08-01T00:00:00.000Z",
  intermediationContractVersion: "v0.1",
  docsJson: { taxCertificateUrl: "https://example.com/doc.pdf" },
  verificationEvents: [
    {
      id: "ev1",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actorAdminId: null,
      note: null,
      docsJson: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof MerchantActionDialog>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MerchantActionDialog
        variant="suspend"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("MerchantActionDialog — suspend", () => {
  it("states the real blast radius (every active offer, every buyer refunded) with the merchant's name, before the click", () => {
    renderDialog();
    // The merchant's real name is interpolated in, not a generic template.
    expect(screen.getByText(/Ada Fırın/)).toBeInTheDocument();
    // The two real, unconditional consequences from the product brief:
    // every active offer cancelled, every affected buyer refunded.
    expect(
      screen.getByText(/tüm aktif teklifleri iptal edilecek/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/her alıcıya tam iade yapılacaktır/i),
    ).toBeInTheDocument();
  });

  it("renders the confirm button in the dangerous/red styling for suspend", () => {
    renderDialog();
    const confirmButton = screen.getByRole("button", {
      name: /Askıya al, teklifleri iptal et/i,
    });
    expect(confirmButton.className).toMatch(/dangerButton/);
  });

  it("calls onConfirm with the entered note when confirmed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    await user.type(
      screen.getByLabelText(/Not \(opsiyonel\)/i),
      "tekrar eden şikayetler",
    );
    await user.click(
      screen.getByRole("button", { name: /Askıya al, teklifleri iptal et/i }),
    );
    expect(onConfirm).toHaveBeenCalledWith("tekrar eden şikayetler");
  });

  it("never fetches the KYC detail for a suspend decision — it isn't a KYC judgment", () => {
    renderDialog();
    expect(getMerchantDetail).not.toHaveBeenCalled();
  });
});

describe("MerchantActionDialog — reject", () => {
  it("requires a written reason before it will confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    getMerchantDetail.mockResolvedValue(KYC_DETAIL);
    renderDialog({ variant: "reject", onConfirm, merchantId: "merchant-1" });
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Reddetmek için bir gerekçe yazmalısınız/i),
    ).toBeInTheDocument();
  });

  it("confirms once a reason is entered", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    getMerchantDetail.mockResolvedValue(KYC_DETAIL);
    renderDialog({ variant: "reject", onConfirm, merchantId: "merchant-1" });
    await user.type(
      screen.getByLabelText(/Ret gerekçesi \(zorunlu\)/i),
      "VKN doğrulanamadı",
    );
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(onConfirm).toHaveBeenCalledWith("VKN doğrulanamadı");
  });
});

// [I7 fix] Regression coverage: before this, nothing in admin-web ever
// called GET /admin/merchants/{id} — the approve/reject dialog was a
// rubber stamp with no docsJson, IBAN, or verification history in sight.
describe("MerchantActionDialog — approve/reject show the audited KYC detail", () => {
  it("fetches and renders the IBAN, docsJson, and verification history for an approve decision", async () => {
    getMerchantDetail.mockResolvedValue(KYC_DETAIL);
    renderDialog({ variant: "approve", merchantId: "merchant-1" });

    await waitFor(() => {
      expect(
        screen.getByText("TR330006100519786457841326"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/taxCertificateUrl/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Taslak.*Başvuru yapıldı/)).toBeInTheDocument();
    expect(getMerchantDetail).toHaveBeenCalledWith("merchant-1");
  });

  it("shows a real error (not a silent blank) when the KYC detail fails to load", async () => {
    getMerchantDetail.mockRejectedValue(new Error("network down"));
    renderDialog({ variant: "reject", merchantId: "merchant-1" });

    await waitFor(() => {
      expect(
        screen.getByText("İşlem gerçekleştirilemedi. Lütfen tekrar deneyin."),
      ).toBeInTheDocument();
    });
  });
});
