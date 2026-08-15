import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../api/client";
import { castAdminResponse } from "../../api/admin-types";
import type { PlatformPricing } from "../../api/admin-types";

export function usePricingList() {
  return useQuery({
    queryKey: ["admin", "pricing"],
    queryFn: async (): Promise<PlatformPricing[]> => {
      const res = await client.admin.pricing.list();
      return castAdminResponse<PlatformPricing[]>(res);
    },
  });
}

export interface SchedulePricingInput {
  bagFeeCents: number;
  membershipAnnualCents: number;
  /** ISO-8601 instant — must be strictly in the future (backend rejects
   * otherwise with PRICING_EFFECTIVE_FROM_NOT_FUTURE). */
  effectiveFrom: string;
}

export function useSchedulePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SchedulePricingInput) =>
      client.admin.pricing
        .schedule(input)
        .then((res) => castAdminResponse<PlatformPricing>(res)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing"] }),
  });
}
