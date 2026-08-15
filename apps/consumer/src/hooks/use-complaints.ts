import { useMutation } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import type { ComplaintTicket } from "../lib/api-types";

export function useCreateComplaint() {
  return useMutation({
    mutationFn: async (body: {
      category:
        | "FOOD_QUALITY"
        | "MISSING_ITEMS"
        | "WRONG_ITEMS"
        | "STORE_CLOSED_NO_SHOW"
        | "RUDE_STAFF"
        | "PAYMENT_BILLING"
        | "SAFETY_HYGIENE"
        | "OTHER";
      description: string;
      reservationId?: string;
    }) => (await client.complaints.create(body)) as ComplaintTicket,
  });
}
