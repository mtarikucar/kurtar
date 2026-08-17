import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";

/** Every screen test renders through this — a fresh QueryClient per test
 * (retry disabled so an error state resolves immediately instead of
 * backing off), a MemoryRouter so route guards/redirects are exercisable,
 * and the real AuthProvider (its `client.merchant.getMe()` bootstrap call
 * is what test files mock at the module boundary — see each test's own
 * `vi.mock("../api/client", ...)`). */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
