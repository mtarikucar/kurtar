import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("../../api/client", () => ({
  client: {
    admin: {
      reports: {
        list: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
        })),
      },
    },
  },
}));

import { client } from "../../api/client";
import { useReportsList } from "./useReports";

const mockList = client.admin.reports.list as unknown as ReturnType<
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

// [I10 fix] Before this fix, useReportsList had no refetchInterval — the
// takedownCountdownMs badge (48h deadline, 3h critical window — the
// tighter of the two regulated clocks this app shows) froze at whatever
// the server said at the moment the tab was opened.
describe("useReportsList — takedown countdown re-syncs on an interval (I10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockList.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches on a 60s interval instead of only once at mount", async () => {
    renderHook(() => useReportsList("ALL", "ALL", 1, 20), { wrapper });

    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});
