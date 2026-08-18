import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      complaints: {
        list: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
        })),
      },
    },
  },
}));

import { client } from "../../api/client";
import { useComplaintsList } from "./useComplaints";

const mockList = client.admin.complaints.list as unknown as ReturnType<
  typeof vi.fn
>;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// [I10 fix] Before this fix, useComplaintsList had no refetchInterval —
// the slaCountdownMs badge and the AT_RISK filter both froze at whatever
// the server said at the moment the tab was opened, forever, on an
// always-open ops console.
describe("useComplaintsList — SLA countdown re-syncs on an interval (I10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockList.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches on a 60s interval instead of only once at mount", async () => {
    renderHook(() => useComplaintsList({ status: "ALL" }, 1, 20), {
      wrapper,
    });

    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(3));
  });
});
