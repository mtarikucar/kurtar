import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type {
  MembershipMine,
  SettlementDetail,
  SettlementListResponse,
} from "../api/response-types";

/**
 * `client.settlements.listMine()` takes no query parameters today (see
 * packages/api-client/src/domains/settlements.ts — the wrapper never
 * forwards `page`/`pageSize` even though the backend's
 * `ListSettlementsQueryDto` accepts them) — a minor api-client gap flagged
 * in this task's report, distinct from the response-typing drift documented
 * in api/response-types.ts. Net effect here: this screen always sees the
 * server's own default page (page 1, pageSize 20) with no way to page
 * further without a client change outside this app's directory.
 */
export function useSettlements() {
  return useQuery({
    queryKey: ["settlements", "mine"],
    queryFn: async () =>
      asResponse<SettlementListResponse>(await client.settlements.listMine()),
    staleTime: 30_000,
  });
}

export function useSettlementDetail(id: string | null) {
  return useQuery({
    queryKey: ["settlements", "mine", "detail", id],
    queryFn: async () =>
      asResponse<SettlementDetail>(
        await client.settlements.getMine(id as string),
      ),
    enabled: id !== null,
  });
}

export function useMembership() {
  return useQuery({
    queryKey: ["merchant", "membership"],
    queryFn: async () =>
      asResponse<MembershipMine>(await client.merchant.getMembership()),
    staleTime: 60_000,
  });
}
