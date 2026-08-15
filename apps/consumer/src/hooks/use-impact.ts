import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import type { ImpactTotals } from "../lib/api-types";

export function useImpact() {
  return useQuery({
    queryKey: ["impact", "mine"],
    queryFn: async () => (await client.impact.getMine()) as ImpactTotals,
    staleTime: 60_000,
  });
}
