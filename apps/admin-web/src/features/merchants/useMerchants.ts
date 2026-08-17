import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type {
  AdminMerchantDetail,
  AdminMerchantListResponse,
  MerchantVerificationStatus,
} from "../../api/admin-types";

/**
 * `"PENDING"` is synthetic — GET /admin/merchants only accepts ONE
 * `status` value, but "awaiting approval" (what the dashboard's
 * `pendingMerchantApprovals` tile counts) is SUBMITTED ∪ UNDER_REVIEW
 * (see backend/src/modules/admin/admin-dashboard.service.ts). This value
 * fetches both and merges them client-side so the dashboard tile's link
 * lands on the exact same set it counted.
 */
export type MerchantStatusFilter =
  MerchantVerificationStatus | "ALL" | "PENDING";

const PENDING_STATUSES: MerchantVerificationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
];

export function useMerchantsList(
  filter: MerchantStatusFilter,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "merchants", filter, page, pageSize],
    queryFn: async (): Promise<AdminMerchantListResponse> => {
      if (filter === "PENDING") {
        // Each half is fetched with the largest page size the backend
        // allows (AdminListMerchantsQueryDto caps pageSize at 100 —
        // @Max(100); a live walkthrough against the real backend caught
        // an earlier 200 here failing with a 400 "pageSize must not be
        // greater than 100") rather than true merged pagination, since the
        // two source pages can't be combined server-side. A 1-3 person ops
        // team realistically never has >100 merchants concurrently
        // SUBMITTED/UNDER_REVIEW at once; noted as a known scaling limit
        // in the Task 11 report regardless.
        const pages = await Promise.all(
          PENDING_STATUSES.map((status) =>
            client.admin.merchants.list({ status, page: 1, pageSize: 100 }),
          ),
        );
        const merged = pages
          .flatMap((res) => res.items)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        const total = pages.reduce((sum, res) => sum + res.total, 0);
        const start = (page - 1) * pageSize;
        return {
          items: merged.slice(start, start + pageSize),
          total,
          page,
          pageSize,
        };
      }
      return client.admin.merchants.list({
        status: filter === "ALL" ? undefined : filter,
        page,
        pageSize,
      });
    },
  });
}

/** Every APPROVED merchant, so the "due for re-verification" section can
 * compute a due date (see its own doc comment in MerchantsPage.tsx). No
 * server-side re-verification filter or field exists — only the raw
 * APPROVED list. `pageSize: 100` is the backend's own max
 * (AdminListMerchantsQueryDto's `@Max(100)`), not a scale choice. */
export function useApprovedMerchantsForReverify() {
  return useQuery({
    queryKey: ["admin", "merchants", "approved-for-reverify"],
    queryFn: async (): Promise<AdminMerchantListResponse> => {
      return client.admin.merchants.list({
        status: "APPROVED",
        page: 1,
        pageSize: 100,
      });
    },
  });
}

/**
 * [I7 fix] The audited KYC-detail read — GET /admin/merchants/{id}. Every
 * server-side read is audited (an AuditLog row), so this is deliberately
 * only ever fetched when an admin is actually about to make an
 * approve/reject decision (MerchantActionDialog), not eagerly for every
 * row in the list — that would generate an audit entry for merchants
 * nobody is reviewing.
 */
export function useMerchantDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin", "merchants", "detail", id],
    queryFn: async (): Promise<AdminMerchantDetail> =>
      client.admin.merchants.get(id as string),
    enabled: id !== null,
  });
}

function useInvalidateMerchants() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
}

export function useApproveMerchant() {
  const invalidate = useInvalidateMerchants();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      client.admin.merchants.approve(id, { note }),
    onSuccess: invalidate,
  });
}

export function useRejectMerchant() {
  const invalidate = useInvalidateMerchants();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      client.admin.merchants.reject(id, { note }),
    onSuccess: invalidate,
  });
}

export function useSuspendMerchant() {
  const invalidate = useInvalidateMerchants();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      client.admin.merchants.suspend(id, { note }),
    onSuccess: invalidate,
  });
}
