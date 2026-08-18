import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { KurtarApiError, type KurtarClient } from "@kurtar/api-client";
import { renderWithProviders } from "../test/testUtils";
import { OnboardingPage } from "./OnboardingPage";

const getMe = vi.fn();
const submitForReview = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    merchant: {
      getMe: (...args: unknown[]) => getMe(...args),
      submitForReview: (...args: unknown[]) => submitForReview(...args),
    },
    auth: { logout: vi.fn() },
  } as unknown as KurtarClient,
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessTokenSnapshot: vi.fn(() => null),
  subscribeAccessToken: vi.fn(() => () => {}),
  subscribeUnauthorized: vi.fn(() => () => {}),
  KurtarApiError,
}));

// [I11 fix] Before this fix, the STT checkbox's only visible text was a
// reference to a "Satış Sözleşmesi ve Teslim Taahhüdü" document that does
// not exist anywhere in the repo, and neither attestation checkbox linked
// to the real Aracılık Sözleşmesi — a merchant was being asked to legally
// attest to something the UI never actually let them read.
describe("OnboardingPage — STT attestation names the real document (I11)", () => {
  beforeEach(() => {
    getMe.mockReset();
    submitForReview.mockReset();
    getMe.mockResolvedValue({
      id: "m1",
      verificationStatus: "DRAFT",
      stores: [],
    });
  });

  it("states the STT undertaking in its own words instead of citing a document that doesn't exist", async () => {
    renderWithProviders(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByText(/son tüketim tarihi geçmiş/)).toBeInTheDocument(),
    );
    // The non-existent document name must be gone.
    expect(
      screen.queryByText(/Satış Sözleşmesi ve Teslim Taahhüdü/),
    ).not.toBeInTheDocument();
  });

  it("links both attestation checkboxes to the real, published Aracılık Sözleşmesi", async () => {
    renderWithProviders(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getAllByRole("link").length).toBeGreaterThan(0),
    );
    const links = screen.getAllByRole("link", { name: "Aracılık Sözleşmesi" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("/tr/yasal/aracilik-sozlesmesi"),
      );
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("records a contract version that matches the published document's own version label, not an unrelated identifier", async () => {
    renderWithProviders(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByText(/v0\.1 — 15 Ağustos 2026/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("2026-08")).not.toBeInTheDocument();
  });
});
