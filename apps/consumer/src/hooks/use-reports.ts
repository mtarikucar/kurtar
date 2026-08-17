import { useMutation } from "@tanstack/react-query";
import { client } from "../lib/api-client";

/**
 * [I14 fix] The notice-and-takedown entry point — POST /api/reports (the
 * 48h moderation clock, backend/src/modules/moderation) — distinct from
 * `use-complaints.ts`'s per-reservation complaint (a 15-day ETAHS reply
 * flow). Before this hook existed, `client.complaints.createReport` had
 * zero call sites on any surface: a consumer who saw an illegal/abusive
 * offer photo, an abusive store, or a defamatory rating had no way to
 * flag it, even though the whole server-side pipeline (throttle, SLA
 * cron, admin queue) was built and running.
 */
export function useCreateReport() {
  return useMutation({
    mutationFn: async (body: {
      targetType: "STORE" | "OFFER" | "RATING";
      targetId: string;
      reason: string;
    }) => client.complaints.createReport(body),
  });
}
