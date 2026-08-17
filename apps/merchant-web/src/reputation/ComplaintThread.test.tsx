import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KurtarApiError, type KurtarClient } from "@kurtar/api-client";
import { ComplaintThread } from "./ComplaintThread";

const getAssigned = vi.fn();
const getConsumerOnly = vi.fn();

// [I18 fix] Regression coverage: merchant-web used to call
// `client.complaints.get` (CONSUMER-only — class-level
// @Actors("CONSUMER") on ComplaintsController), which 403'd on every
// complaint, so a merchant could never read or reply to a thread. This
// asserts the merchant-scoped `getAssigned` is what actually gets called,
// and that the thread + reply form render from its response — not just
// that SOME query resolves.
vi.mock("../api/client", () => ({
  client: {
    complaints: {
      getAssigned: (...args: unknown[]) => getAssigned(...args),
      get: (...args: unknown[]) => getConsumerOnly(...args),
    },
  } as unknown as KurtarClient,
  KurtarApiError,
}));

function renderThread(id = "complaint-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ComplaintThread id={id} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("ComplaintThread — merchant read access", () => {
  it("fetches through the merchant-scoped endpoint and renders the thread + reply form (not a 403 error banner)", async () => {
    // The CONSUMER-only route this used to hit — wired up so a
    // regression back to it fails loudly with the REAL production
    // symptom (a 403 banner) instead of a generic "undefined" crash.
    getConsumerOnly.mockRejectedValue(
      new KurtarApiError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "Forbidden resource",
        isBackendErrorCode: false,
      }),
    );
    getAssigned.mockResolvedValue({
      id: "complaint-1",
      category: "FOOD_QUALITY",
      status: "OPEN",
      description: "Paket bozulmuştu.",
      slaDeadlineAt: "2026-08-20T00:00:00.000Z",
      messages: [
        {
          id: "m1",
          authorType: "CONSUMER",
          body: "Paket ekşimişti.",
          createdAt: "2026-08-15T10:00:00.000Z",
        },
      ],
    });

    renderThread();

    await waitFor(() => {
      expect(screen.getByText("Paket bozulmuştu.")).toBeInTheDocument();
    });
    expect(screen.getByText("Paket ekşimişti.")).toBeInTheDocument();
    // The reply form only renders inside the `detailQuery.data ? ... :
    // null` branch — its presence proves this ISN'T the 403 error-banner
    // path the finding describes.
    expect(screen.getByText("Gönder")).toBeInTheDocument();

    expect(getAssigned).toHaveBeenCalledWith("complaint-1");
    expect(getConsumerOnly).not.toHaveBeenCalled();
  });
});
