import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type {
  AdminReportListResponse,
  DiscoveryStoreProfile,
  ReportStatus,
  ReportTargetType,
} from "../../api/admin-types";

export type ReportStatusFilter = ReportStatus | "ALL";

export function useReportsList(
  statusFilter: ReportStatusFilter,
  targetType: ReportTargetType | "ALL",
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "reports", statusFilter, targetType, page, pageSize],
    queryFn: async (): Promise<AdminReportListResponse> => {
      return client.admin.reports.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        targetType: targetType === "ALL" ? undefined : targetType,
        page,
        pageSize,
      });
    },
  });
}

/** A STORE target's preview — the only target type with a real,
 * admin-reachable single-resource lookup (GET /discovery/stores/{id}, the
 * @Public store profile endpoint). OFFER and RATING targets have NO
 * equivalent single-resource GET anywhere in this API (confirmed: offers
 * only exposes `listMine`, scoped to the calling merchant; ratings has no
 * admin-facing single-rating GET either) — their preview is ID-only, see
 * ReportsPage.tsx's TargetPreview component. */
export function useStoreTargetPreview(
  targetId: string,
  targetType: ReportTargetType,
) {
  return useQuery({
    queryKey: ["discovery", "store", targetId],
    queryFn: async (): Promise<DiscoveryStoreProfile> =>
      client.discovery.store(targetId),
    enabled: targetType === "STORE",
    retry: false,
  });
}

function useInvalidateReports() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
}

export function useActionReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      client.admin.reports.action(id, { note }),
    onSuccess: invalidate,
  });
}

export function useDismissReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      client.admin.reports.dismiss(id, { note }),
    onSuccess: invalidate,
  });
}
