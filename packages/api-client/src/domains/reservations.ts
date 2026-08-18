import type { RequestEngine } from "../engine";
import type { QueryParams, RequestBody } from "../core-types";

/** Consumer-side reservation lifecycle: reserve a bag, redeem it (in-store pickup code), rate it afterward. Used by apps/consumer. */
export function createReservationsDomain(engine: RequestEngine) {
  return {
    /** POST /reservations — reserve a bag off a live offer; charges the consumer. */
    create: (body: RequestBody<"/api/reservations", "post">) =>
      engine.request("post", "/api/reservations", { body }),

    /** POST /reservations/{id}/cancel — cancels before pickup; refund policy applies server-side. */
    cancel: (id: string) =>
      engine.request("post", "/api/reservations/{id}/cancel", { path: { id } }),

    /**
     * GET /reservations/mine — the authenticated consumer's own
     * reservation history, paginated (`page`/`pageSize` both required).
     * [M18 fix] Accepts an optional `AbortSignal` — see discovery.ts's
     * `offers()` doc comment for why this exists on a read-heavy method.
     */
    listMine: (
      query: QueryParams<"/api/reservations/mine", "get">,
      opts?: { signal?: AbortSignal },
    ) =>
      engine.request("get", "/api/reservations/mine", {
        query,
        signal: opts?.signal,
      }),

    /** POST /reservations/{id}/redeem — merchant-side: marks a reservation picked up (pickup-code verified). */
    redeem: (id: string) =>
      engine.request("post", "/api/reservations/{id}/redeem", { path: { id } }),

    /**
     * GET /reservations/for-merchant — merchant-side: the pickup list for
     * the caller's own offers, optionally filtered by store/offer/date/
     * status, paginated. Used by apps/merchant-web.
     *
     * `status` is the one array-shaped query param in this whole API, and
     * the wire encoding is genuinely irregular: the backend expects ONE
     * comma-separated value (`status=CONFIRMED,REDEEMED`), not a repeated
     * key (`status=CONFIRMED&status=REDEEMED`) — see reservations.
     * controller.ts's own doc comment on why (an Express/qs quirk: a
     * repeated key parses server-side as an array where this endpoint's
     * DTO expects a string it CSV-splits itself). `buildQuery`'s default
     * array handling is repeated-key, so this method joins `status`
     * itself before it ever reaches the generic request engine — the
     * public parameter type stays the real, typed array from the
     * generated contract; only the wire serialization differs.
     */
    listForMerchant: (
      query?: QueryParams<"/api/reservations/for-merchant", "get">,
    ) => {
      const { status, ...rest } = query ?? {};
      const wireQuery =
        status && status.length > 0
          ? { ...rest, status: status.join(",") }
          : rest;
      return engine.request("get", "/api/reservations/for-merchant", {
        query: wireQuery as QueryParams<
          "/api/reservations/for-merchant",
          "get"
        >,
      });
    },

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
