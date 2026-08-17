import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type {
  AdminSettlementListResponse,
  SettlementStatus,
} from "../../api/admin-types";

/** `"NEEDS_ATTENTION"` is synthetic — HELD ∪ FAILED, matching exactly what
 * the dashboard's `settlementBatchesNeedingAttention` tile counts (see
 * backend/src/modules/admin/admin-dashboard.service.ts). Two real
 * single-status calls, merged client-side (no true server-side OR
 * filter exists for this endpoint). */
export type SettlementStatusFilter =
  SettlementStatus | "ALL" | "NEEDS_ATTENTION";

const NEEDS_ATTENTION_STATUSES: SettlementStatus[] = ["HELD", "FAILED"];

export function useSettlementsList(
  filter: SettlementStatusFilter,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "settlements", filter, page, pageSize],
    queryFn: async (): Promise<AdminSettlementListResponse> => {
      if (filter === "NEEDS_ATTENTION") {
        // pageSize: 100 is the backend's own max
        // (AdminListSettlementsQueryDto's `@Max(100)`) — a live walkthrough
        // against the real backend caught an earlier 200 here failing with
        // 400 "pageSize must not be greater than 100".
        const pages = await Promise.all(
          NEEDS_ATTENTION_STATUSES.map((status) =>
            client.admin.settlements.list({ status, page: 1, pageSize: 100 }),
          ),
        );
        const merged = pages
          .flatMap((res) => res.items)
          .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
        const total = pages.reduce((sum, res) => sum + res.total, 0);
        const start = (page - 1) * pageSize;
        return {
          items: merged.slice(start, start + pageSize),
          total,
          page,
          pageSize,
        };
      }
      return client.admin.settlements.list({
        status: filter === "ALL" ? undefined : filter,
        page,
        pageSize,
      });
    },
  });
}

export function useSettlementDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "settlements", "detail", id],
    queryFn: () => client.admin.settlements.get(id as string),
    enabled: Boolean(id),
  });
}

function useInvalidateSettlements(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "settlements"] });
    queryClient.invalidateQueries({
      queryKey: ["admin", "settlements", "detail", id],
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
}

export function useApproveSettlement(id: string) {
  const invalidate = useInvalidateSettlements(id);
  return useMutation({
    mutationFn: () => client.admin.settlements.approve(id),
    onSuccess: invalidate,
  });
}

export function useHoldSettlement(id: string) {
  const invalidate = useInvalidateSettlements(id);
  return useMutation({
    mutationFn: (note: string | undefined) =>
      client.admin.settlements.hold(id, { note }),
    onSuccess: invalidate,
  });
}

export function useRetrySettlement(id: string) {
  const invalidate = useInvalidateSettlements(id);
  return useMutation({
    mutationFn: () => client.admin.settlements.retry(id),
    onSuccess: invalidate,
  });
}
