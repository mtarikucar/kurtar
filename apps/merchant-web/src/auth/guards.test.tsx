import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { KurtarApiError, type KurtarClient } from "@kurtar/api-client";
import { AuthProvider } from "./AuthContext";
import { OnboardingLayout, RequireApprovedLayout } from "./guards";

const getMe = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    merchant: { getMe: (...args: unknown[]) => getMe(...args) },
    auth: { logout: vi.fn() },
  } as unknown as KurtarClient,
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessTokenSnapshot: vi.fn(() => null),
  subscribeAccessToken: vi.fn(() => () => {}),
  subscribeUnauthorized: vi.fn(() => () => {}),
  KurtarApiError,
}));

function renderGuardedApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            <Route element={<OnboardingLayout />}>
              <Route path="/baslangic" element={<div>ONBOARDING_SCREEN</div>} />
            </Route>
            <Route element={<RequireApprovedLayout />}>
              <Route path="/bugun" element={<div>TODAY_SCREEN</div>} />
              <Route path="/magaza" element={<div>STORES_SCREEN</div>} />
            </Route>
            <Route path="/giris" element={<div>LOGIN_SCREEN</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Router-level test for the brief's "a SUBMITTED/DRAFT merchant must not
 * be able to reach store/offer screens — the UI should never let them hit
 * [MERCHANT_NOT_APPROVED] blind" requirement. No component here ever
 * calls a gated endpoint; the redirect happens purely from the
 * `verificationStatus` GET /merchants/me already returns, which is exactly
 * the point — it never gets the chance to 403.
 */
describe("approval gate routing", () => {
  beforeEach(() => {
    getMe.mockReset();
  });

  it("redirects a DRAFT merchant away from a gated screen to onboarding, never rendering it", async () => {
    getMe.mockResolvedValue({
      id: "m1",
      verificationStatus: "DRAFT",
      stores: [],
    });

    renderGuardedApp("/magaza");

    await waitFor(() =>
      expect(screen.getByText("ONBOARDING_SCREEN")).toBeInTheDocument(),
    );
    expect(screen.queryByText("STORES_SCREEN")).not.toBeInTheDocument();
  });

  it("redirects a SUBMITTED merchant the same way", async () => {
    getMe.mockResolvedValue({
      id: "m1",
      verificationStatus: "SUBMITTED",
      stores: [],
    });

    renderGuardedApp("/bugun");

    await waitFor(() =>
      expect(screen.getByText("ONBOARDING_SCREEN")).toBeInTheDocument(),
    );
    expect(screen.queryByText("TODAY_SCREEN")).not.toBeInTheDocument();
  });

  it("lets an APPROVED merchant reach the gated screen", async () => {
    getMe.mockResolvedValue({
      id: "m1",
      verificationStatus: "APPROVED",
      stores: [],
    });

    renderGuardedApp("/bugun");

    await waitFor(() =>
      expect(screen.getByText("TODAY_SCREEN")).toBeInTheDocument(),
    );
  });

  it("sends an unauthenticated visitor to login instead of the gated screen", async () => {
    getMe.mockRejectedValue(
      new KurtarApiError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "no session",
        isBackendErrorCode: false,
      }),
    );

    renderGuardedApp("/bugun");

    await waitFor(() =>
      expect(screen.getByText("LOGIN_SCREEN")).toBeInTheDocument(),
    );
  });

  it("keeps an already-APPROVED merchant out of the onboarding screen", async () => {
    getMe.mockResolvedValue({
      id: "m1",
      verificationStatus: "APPROVED",
      stores: [],
    });

    renderGuardedApp("/baslangic");

    await waitFor(() =>
      expect(screen.getByText("TODAY_SCREEN")).toBeInTheDocument(),
    );
    expect(screen.queryByText("ONBOARDING_SCREEN")).not.toBeInTheDocument();
  });
});
