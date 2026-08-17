import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/api-client";

export function useImpact() {
  return useQuery({
    queryKey: ["impact", "mine"],
    queryFn: async () => client.impact.getMine(),
    staleTime: 60_000,
  });
}
