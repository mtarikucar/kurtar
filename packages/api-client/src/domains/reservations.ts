import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";

/** Consumer-side reservation lifecycle: reserve a bag, redeem it (in-store pickup code), rate it afterward. Used by apps/consumer. */
export function createReservationsDomain(engine: RequestEngine) {
  return {
    /** POST /reservations — reserve a bag off a live offer; charges the consumer. */
    create: (body: RequestBody<"/api/reservations", "post">) =>
      engine.request("post", "/api/reservations", { body }),

    /** POST /reservations/{id}/cancel — cancels before pickup; refund policy applies server-side. */
    cancel: (id: string) =>
      engine.request("post", "/api/reservations/{id}/cancel", { path: { id } }),

    /** GET /reservations/mine — the authenticated consumer's own reservation history. */
    listMine: () => engine.request("get", "/api/reservations/mine"),

    /** POST /reservations/{id}/redeem — merchant-side: marks a reservation picked up (pickup-code verified). */
    redeem: (id: string) =>
      engine.request("post", "/api/reservations/{id}/redeem", { path: { id } }),

    /** POST /reservations/{id}/rating — consumer rates a redeemed reservation. */
    rate: (
      id: string,
      body: RequestBody<"/api/reservations/{id}/rating", "post">,
    ) =>
      engine.request("post", "/api/reservations/{id}/rating", {
        path: { id },
        body,
      }),
  };
}

export type ReservationsDomain = ReturnType<typeof createReservationsDomain>;
