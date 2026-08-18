import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import type { InvoiceStatus } from "../../api/admin-types";

/**
 * [M16 fix] The commission e-invoice queue.
 *
 * A commission invoice that fails issuance at the e-document provider
 * stays DRAFT. The outbox retries it and a daily cron emails ops about
 * anything still DRAFT hours later — but no screen in this product ever
 * showed one, so "is anything stuck right now?" could only be answered
 * from a mailbox or the server logs, and there was no way at all to act
 * on it once the retry ladder was exhausted.
 *
 * Default filter is DRAFT, not ALL: this screen exists for the stuck
 * ones. `"ALL"` is one selection away for an audit view.
 */
export type InvoiceStatusFilter = InvoiceStatus | "ALL";

export function useInvoicesList(
  filter: InvoiceStatusFilter,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ["admin", "invoices", filter, page, pageSize],
    queryFn: () =>
      client.admin.invoices.list({
        status: filter === "ALL" ? undefined : filter,
        page,
        pageSize,
      }),
  });
}

/** Re-issue ONE stuck invoice. Safe to expose because the backend reuses
 * the same invoice id as the provider's idempotency key, so a repeat can
 * never mint a second e-fatura — see CommissionInvoiceService.adminReissue. */
export function useReissueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.admin.invoices.reissue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      // A re-issued invoice also changes what the settlement detail
      // screen's invoices card shows for its batch.
      queryClient.invalidateQueries({ queryKey: ["admin", "settlements"] });
    },
  });
}
