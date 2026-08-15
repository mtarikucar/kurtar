import { useMutation } from "@tanstack/react-query";
import { client } from "../lib/api-client";

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
    }) => client.complaints.create(body),
  });
}
