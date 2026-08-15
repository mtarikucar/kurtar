import { useQuery } from "@tanstack/react-query";
import { client } from "../../api/client";
import { castAdminResponse } from "../../api/admin-types";
import type {
  AdminComplaintListItem,
  AdminComplaintListResponse,
  AdminDashboardSummary,
  AdminReportListItem,
  AdminReportListResponse,
  AdminSettlementListItem,
  AdminSettlementListResponse,
} from "../../api/admin-types";

const REFRESH_INTERVAL_MS = 60_000;

/** GET /admin/dashboard. Cast per api/admin-types.ts's header comment
 * (problem 1 — every client.* call needs this, not only the operations
 * docs/frontend-contract.md §9 flags as gaps). */
export function useDashboardSummary() {
  return useQuery({
    queryKey: ["admin", "dashboard", "summary"],
    queryFn: async (): Promise<AdminDashboardSummary> =>
      castAdminResponse<AdminDashboardSummary>(
        await client.admin.getDashboard(),
      ),
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}

/**
 * The dashboard's complaints preview needs "not yet RESOLVED", but
 * GET /admin/complaints only accepts ONE `status` value, not a set — so
 * this fetches a status-unfiltered page (already sorted soonest-deadline-
 * first by the backend) and filters client-side to the statuses that still
 * need action. Real data, real filter, just applied on this side of the
 * wire because the query API can't express "not equal to RESOLVED".
 */
export function useUrgentComplaints(previewSize = 5) {
  return useQuery({
    queryKey: ["admin", "dashboard", "complaints-preview"],
    queryFn: async (): Promise<AdminComplaintListItem[]> => {
      const res = castAdminResponse<AdminComplaintListResponse>(
        await client.admin.complaints.list({ page: 1, pageSize: 50 }),
      );
      return res.items
        .filter(
          (item) =>
            item.status === "OPEN" || item.status === "MERCHANT_RESPONDED",
        )
        .slice(0, previewSize);
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}

/** GET /admin/reports?status=OPEN — a single real status value, no client
 * filtering needed. Response cast per api/admin-types.ts (see its header
 * comment for why). */
export function useUrgentReports(previewSize = 5) {
  return useQuery({
    queryKey: ["admin", "dashboard", "reports-preview"],
    queryFn: async (): Promise<AdminReportListItem[]> => {
      const res = castAdminResponse<AdminReportListResponse>(
        await client.admin.reports.list({
          status: "OPEN",
          page: 1,
          pageSize: previewSize,
        }),
      );
      return res.items;
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}

export interface SettlementsNeedingAttention {
  held: AdminSettlementListItem[];
  failed: AdminSettlementListItem[];
}

/** HELD and FAILED are each a single real status value — two parallel
 * calls, no client filtering. */
export function useSettlementsNeedingAttention(previewSize = 5) {
  return useQuery({
    queryKey: ["admin", "dashboard", "settlements-preview"],
    queryFn: async (): Promise<SettlementsNeedingAttention> => {
      const [held, failed] = await Promise.all([
        client.admin.settlements.list({
          status: "HELD",
          page: 1,
          pageSize: previewSize,
        }),
        client.admin.settlements.list({
          status: "FAILED",
          page: 1,
          pageSize: previewSize,
        }),
      ]);
      return {
        held: castAdminResponse<AdminSettlementListResponse>(held).items,
        failed: castAdminResponse<AdminSettlementListResponse>(failed).items,
      };
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}
