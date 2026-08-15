import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client";

/**
 * `client.settlements.listMine()` requires `{ page, pageSize }` — both
 * required by the committed contract
 * (packages/api-client/src/domains/settlements.ts), matching
 * docs/openapi.json even though the backend DTO gives them runtime
 * defaults of 1/20. There is no pagination UI on this screen yet (see
 * EarningsPage.tsx), so this always asks for the server's own first page
 * at its default size — the same result this screen showed before the
 * contract made the params explicit.
 */
export function useSettlements() {
  return useQuery({
    queryKey: ["settlements", "mine", 1, 20],
    queryFn: async () => client.settlements.listMine({ page: 1, pageSize: 20 }),
    staleTime: 30_000,
  });
}

export function useSettlementDetail(id: string | null) {
  return useQuery({
    queryKey: ["settlements", "mine", "detail", id],
    queryFn: async () => client.settlements.getMine(id as string),
    enabled: id !== null,
  });
}

export function useMembership() {
  return useQuery({
    queryKey: ["merchant", "membership"],
    queryFn: async () => client.merchant.getMembership(),
    staleTime: 60_000,
  });
}
