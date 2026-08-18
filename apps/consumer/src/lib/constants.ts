/**
 * `CANCEL_DEADLINE_BEFORE_PICKUP_MS` — mirrors the backend's own fixed
 * constant (backend/src/modules/reservations/reservations.service.ts):
 * every reservation's `cancelDeadlineAt` is computed at creation as
 * `offer.pickupStartAt - CANCEL_DEADLINE_BEFORE_PICKUP_MS`. It is read
 * here only to STATE the free-cancellation rule to the customer ("2 saat
 * öncesine kadar", offer/[id].tsx) — never to reconstruct a time.
 *
 * [Cross-lane fix, I9] It used to do exactly that: `derivePickupStartAt`
 * recovered the pickup window's START as `cancelDeadlineAt + 2h`, because
 * `GET /reservations/mine` did not return the offer's window (and had no
 * END time to recover at all). `ReservationDto` now carries
 * `pickupStartAt`/`pickupEndAt` outright, so the derivation is gone and
 * with it the class of bug where a backend change to this constant would
 * have silently shifted every pickup time this app displays. The
 * drift guard on the constant itself stays (__tests__/constants.test.ts),
 * since the sentence shown to the customer must still be true.
 */
export const CANCEL_DEADLINE_BEFORE_PICKUP_MS = 2 * 60 * 60 * 1000;
