import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type {
  AdminComplaintListItem,
  AdminComplaintListResponse,
  ComplaintCategory,
  ComplaintDetail,
  ComplaintStatus,
} from "../../api/admin-types";
import {
  COMPLAINT_SLA_THRESHOLDS,
  classifyDeadline,
} from "../../lib/countdown";

/**
 * `"OPEN_ACTIVE"` and `"AT_RISK"` are synthetic — GET /admin/complaints
 * only accepts ONE `status` value. `OPEN_ACTIVE` mirrors exactly what the
 * dashboard's `openComplaints` tile counts (`status IN (OPEN,
 * MERCHANT_RESPONDED)` — backend/src/modules/admin/admin-dashboard.
 * service.ts); `AT_RISK` additionally requires the SLA warning threshold
 * (`complaintsSlaAtRisk`'s own definition there). Both are computed
 * client-side over a status-unfiltered fetch.
 */
export type ComplaintStatusFilter =
  ComplaintStatus | "ALL" | "OPEN_ACTIVE" | "AT_RISK";

// The backend's own max (AdminListComplaintsQueryDto's `@Max(100)`) — a
// live walkthrough against the real backend caught an earlier 200 here
// failing with 400 "pageSize must not be greater than 100".
const PAGE_SIZE_FOR_SYNTHETIC_FILTER = 100;

export interface ComplaintsListFilters {
  status: ComplaintStatusFilter;
  category?: ComplaintCategory;
  merchantId?: string;
}

export function useComplaintsList(
  { status, category, merchantId }: ComplaintsListFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: [
      "admin",
      "complaints",
      status,
      category,
      merchantId,
      page,
      pageSize,
    ],
    queryFn: async (): Promise<AdminComplaintListResponse> => {
      if (status === "OPEN_ACTIVE" || status === "AT_RISK") {
        // The synthetic urgency filters still need category/merchantId
        // applied — the real query params below carry them for the
        // server-filterable statuses, but a synthetic filter's source
        // fetch is status-unfiltered, so category/merchant narrowing has
        // to happen client-side here too, on the SAME already-fetched
        // page (no extra request).
        const res = await client.admin.complaints.list({
          category,
          merchantId,
          page: 1,
          pageSize: PAGE_SIZE_FOR_SYNTHETIC_FILTER,
        });
        let items: AdminComplaintListItem[] = res.items.filter(
          (item) =>
            item.status === "OPEN" || item.status === "MERCHANT_RESPONDED",
        );
        if (status === "AT_RISK") {
          items = items.filter(
            (item) =>
              classifyDeadline(
                item.slaCountdownMs,
                COMPLAINT_SLA_THRESHOLDS,
              ) !== "safe",
          );
        }
        const start = (page - 1) * pageSize;
        return {
          items: items.slice(start, start + pageSize),
          total: items.length,
          page,
          pageSize,
        };
      }
      return client.admin.complaints.list({
        status: status === "ALL" ? undefined : status,
        category,
        merchantId,
        page,
        pageSize,
      });
    },
  });
}

export function useComplaintDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "complaints", "detail", id],
    queryFn: async (): Promise<ComplaintDetail> =>
      client.admin.complaints.get(id as string),
    enabled: Boolean(id),
  });
}

function useInvalidateComplaints(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "complaints"] });
    queryClient.invalidateQueries({
      queryKey: ["admin", "complaints", "detail", id],
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
}

export function useResolveComplaint(id: string) {
  const invalidate = useInvalidateComplaints(id);
  return useMutation({
    mutationFn: (note: string | undefined) =>
      client.admin.complaints.resolve(id, { note }),
    onSuccess: invalidate,
  });
}

/**
 * `client.admin.complaints.escalate(id)` takes NO second (body) argument —
 * unlike `.resolve()`, the `admin.ts` domain wrapper for this one operation
 * doesn't expose `AdminComplaintActionDto.note`, even though the backend
 * controller accepts it (optional). Since `note` is optional there anyway,
 * this doesn't block escalating — it just means an admin note can't be
 * attached to an escalation from this UI today. Worth flagging alongside
 * this task's other `@kurtar/api-client` findings; not fixed here (out of
 * scope for apps/admin-web).
 */
export function useEscalateComplaint(id: string) {
  const invalidate = useInvalidateComplaints(id);
  return useMutation({
    mutationFn: () => client.admin.complaints.escalate(id),
    onSuccess: invalidate,
  });
}

export function usePostComplaintMessage(id: string) {
  const invalidate = useInvalidateComplaints(id);
  return useMutation({
    mutationFn: (body: string) => client.complaints.addMessage(id, { body }),
    onSuccess: invalidate,
  });
}

/** [I3 fix] The admin-initiated make-whole action for a picked-up
 * spoiled/missing/wrong bag — refunds the complaint's linked reservation
 * (only valid once REDEEMED). Always invalidates on settle (not just
 * onSuccess): the backend never throws for a provider-side failure — it
 * returns `{ok: false, error}` — so the ticket's `refundedAt` may or may
 * not have moved, and the caller needs a fresh read either way. */
export function useRefundComplaint(id: string) {
  const invalidate = useInvalidateComplaints(id);
  return useMutation({
    mutationFn: () => client.admin.complaints.refund(id),
    onSettled: invalidate,
  });
}
