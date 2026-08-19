import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", async () => {
  const actual =
    await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    client: {
      auth: {
        adminLogin: vi.fn(),
        refresh: vi.fn(),
        logout: vi.fn(),
      },
    },
  };
});

import { AuthProvider, useAuth } from "./AuthContext";
import {
  client,
  getStoredAccessToken,
  setStoredAccessToken,
} from "../api/client";

const mockAdminLogin = client.auth.adminLogin as unknown as ReturnType<
  typeof vi.fn
>;
const mockRefresh = client.auth.refresh as unknown as ReturnType<typeof vi.fn>;

let girisYap: (email: string, password: string) => Promise<void>;

function Prob() {
  const { status, login } = useAuth();
  girisYap = login;
  return <span data-testid="durum">{status}</span>;
}

/**
 * [M3] `engine.ts` fires `onTokensIssued` from exactly one place — inside
 * `performRefresh` — never for a plain login response. merchant-web and
 * apps/consumer both persist the token their own login returned;
 * admin-web threw it away, so the first authenticated request of every
 * admin session went out with no bearer and 401'd, and only recovered
 * through the engine's 401->refresh branch. With the refresh cookie
 * missing or blocked (a cross-registrable-domain panel origin, or a
 * staging box refusing the panel's origin at CORS), that recovery fails
 * and the admin is bounced back to the login screen a heartbeat after a
 * login that visibly succeeded.
 */
describe("admin AuthContext.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoredAccessToken(null);
    sessionStorage.clear();
    // The mount-time session restore must not settle the session for us.
    mockRefresh.mockReturnValue(new Promise(() => undefined));
  });

  it("keeps the access token its own login returned", async () => {
    mockAdminLogin.mockResolvedValue({
      accessToken: "access-token-x",
      user: { id: "a1", email: "admin@kurtar.app", name: "Admin" },
    });

    render(
      <AuthProvider>
        <Prob />
      </AuthProvider>,
    );

    await act(async () => {
      await girisYap("admin@kurtar.app", "hunter2");
    });

    await waitFor(() =>
      expect(screen.getByTestId("durum").textContent).toBe("authenticated"),
    );
    expect(getStoredAccessToken()).toBe("access-token-x");
  });

  it("does not depend on a refresh round trip to get one", async () => {
    mockAdminLogin.mockResolvedValue({
      accessToken: "access-token-x",
      user: { id: "a1", email: "admin@kurtar.app", name: "Admin" },
    });

    render(
      <AuthProvider>
        <Prob />
      </AuthProvider>,
    );
    await act(async () => {
      await girisYap("admin@kurtar.app", "hunter2");
    });

    // login() itself is the only call that has happened.
    expect(mockRefresh).toHaveBeenCalledTimes(1); // the mount-time restore, still pending
    expect(getStoredAccessToken()).toBe("access-token-x");
  });
});
