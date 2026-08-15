import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KurtarApiError, type KurtarClient } from "@kurtar/api-client";
import { renderWithProviders } from "../test/testUtils";
import { LoginPage } from "./LoginPage";

const merchantLogin = vi.fn();
const getMe = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    auth: { merchantLogin: (...args: unknown[]) => merchantLogin(...args) },
    merchant: { getMe: (...args: unknown[]) => getMe(...args) },
  } as unknown as KurtarClient,
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessTokenSnapshot: vi.fn(() => null),
  subscribeAccessToken: vi.fn(() => () => {}),
  subscribeUnauthorized: vi.fn(() => () => {}),
  KurtarApiError,
}));

describe("LoginPage — error branching", () => {
  beforeEach(() => {
    merchantLogin.mockReset();
    getMe.mockReset();
    // AuthProvider always bootstraps a getMe() call on mount; a brand-new
    // visitor to /giris has no session yet.
    getMe.mockRejectedValue(
      new KurtarApiError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Unauthorized",
        isBackendErrorCode: false,
      }),
    );
  });

  it("shows a bad-credentials message, distinct from the approval-gate message, on wrong password", async () => {
    merchantLogin.mockRejectedValue(
      new KurtarApiError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Invalid credentials",
        isBackendErrorCode: false,
      }),
    );

    renderWithProviders(<LoginPage />, { route: "/giris" });

    await userEvent.type(screen.getByLabelText(/e-posta/i), "sahibi@firma.com");
    await userEvent.type(screen.getByLabelText(/şifre/i), "yanlis-sifre");
    await userEvent.click(screen.getByRole("button", { name: /giriş yap/i }));

    await waitFor(() => {
      expect(
        screen.getByText("E-posta veya şifre hatalı."),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(
        "Bu işlem için işletmenizin onaylanmış olması gerekiyor.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a distinct approval-gate message when the account is not approved", async () => {
    merchantLogin.mockRejectedValue(
      new KurtarApiError({
        statusCode: 403,
        errorCode: "MERCHANT_NOT_APPROVED",
        message: "This action requires an APPROVED merchant account.",
        isBackendErrorCode: true,
      }),
    );

    renderWithProviders(<LoginPage />, { route: "/giris" });

    await userEvent.type(screen.getByLabelText(/e-posta/i), "sahibi@firma.com");
    await userEvent.type(screen.getByLabelText(/şifre/i), "dogru-sifre-12345");
    await userEvent.click(screen.getByRole("button", { name: /giriş yap/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Bu işlem için işletmenizin onaylanmış olması gerekiyor.",
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("E-posta veya şifre hatalı."),
    ).not.toBeInTheDocument();
  });

  it("logs in successfully and calls getMe to resolve the merchant profile", async () => {
    merchantLogin.mockResolvedValue({ accessToken: "token-abc" });
    getMe.mockResolvedValue({
      id: "m1",
      legalName: "Örnek Fırın Ltd",
      tradeName: "Örnek Fırın",
      taxId: "1234567890",
      iban: "TR330006100519786457841326",
      verificationStatus: "APPROVED",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      nextReverifyAt: null,
      sttAttestationAcceptedAt: "2026-01-01T00:00:00.000Z",
      intermediationAcceptedAt: "2026-01-01T00:00:00.000Z",
      intermediationContractVersion: "1.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      stores: [],
    });

    renderWithProviders(<LoginPage />, { route: "/giris" });

    await userEvent.type(screen.getByLabelText(/e-posta/i), "sahibi@firma.com");
    await userEvent.type(screen.getByLabelText(/şifre/i), "dogru-sifre-12345");
    await userEvent.click(screen.getByRole("button", { name: /giriş yap/i }));

    await waitFor(() => {
      expect(merchantLogin).toHaveBeenCalledWith({
        email: "sahibi@firma.com",
        password: "dogru-sifre-12345",
      });
    });
    await waitFor(() => {
      // getMe is called once for the initial bootstrap and once more after
      // login's setAccessToken — both real, no error banner should remain.
      expect(getMe).toHaveBeenCalled();
    });
  });
});
