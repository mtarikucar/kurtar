import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const MY_COMPLAINTS_QUERY_KEY = ["complaints", "mine"] as const;

/**
 * [I8 fix] `GET /complaints/mine` — the read side of "file a complaint",
 * which previously had no caller anywhere in the app: a consumer could
 * file a ticket and never see the merchant's or admin's reply, so the
 * ETAHS 15-day clock was answered into a void from their point of view.
 */
export function useMyComplaints() {
  return useQuery({
    queryKey: MY_COMPLAINTS_QUERY_KEY,
    queryFn: () => client.complaints.listMine({ page: 1, pageSize: 50 }),
    staleTime: 15_000,
  });
}

function complaintQueryKey(id: string) {
  return ["complaints", "mine", id] as const;
}

/** [I8 fix] `GET /complaints/{id}` — one complaint's detail + message thread. */
export function useComplaint(id: string) {
  return useQuery({
    queryKey: complaintQueryKey(id),
    queryFn: () => client.complaints.get(id),
    enabled: id.length > 0,
  });
}

/** [I8 fix] `POST /complaints/{id}/messages` — reply into the thread as
 * the consumer. Invalidates both the detail (new message) and the list
 * (status may have flipped OPEN -> MERCHANT_RESPONDED on the other side,
 * or this reply reopens an ESCALATED ticket in the merchant/admin's view). */
export function useAddComplaintMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => client.complaints.addMessage(id, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complaintQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: MY_COMPLAINTS_QUERY_KEY });
    },
  });
}
