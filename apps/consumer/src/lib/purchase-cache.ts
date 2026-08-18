import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Backfills a real, confirmed backend gap: `GET /reservations/mine`
 * (backend/src/modules/reservations/dto/reservation-response.dto.ts's
 * `ReservationDto`) is the RAW Reservation row — no store name, no
 * bag/offer title, no cover image. The Orders and Redeem screens need all
 * of that. There is no `GET /reservations/:id` detail endpoint either, so
 * nothing server-side can backfill it after the fact for an existing
 * reservation.
 *
 * [Cross-lane fix, I9] THE PICKUP WINDOW IS NO LONGER PART OF THAT GAP.
 * `ReservationDto` now carries `pickupStartAt`/`pickupEndAt`, joined from
 * the reservation's own DailyOffer, so no screen reconstructs the window
 * from `cancelDeadlineAt` any more and none of them lose the window's
 * CLOSE time when this cache is empty — which used to be exactly the
 * situation the redeem screen faced on a reinstalled device at the
 * counter. The two window fields below are kept as what they always
 * literally were, a record of the window AS SHOWN AT PURCHASE TIME, but
 * nothing reads them for display: the server's own values win everywhere.
 *
 * The one place this app DOES have the full picture is the moment of
 * purchase — the offer detail screen already fetched the store + bag
 * template + exact pickup window via the public `discovery.store()` (or
 * `discovery.offers()`) call. This cache captures that snapshot right
 * after `POST /reservations` succeeds, keyed by the new reservationId, so
 * every screen that lists or opens an order can enrich the bare backend
 * row with real, previously-fetched data instead of a placeholder.
 *
 * This is a CACHE, not a source of truth: a fresh install / different
 * device / evicted storage simply has nothing for an older reservation,
 * and callers (see hooks/use-order-details.ts) fall back to a live
 * `discovery.store()` re-lookup (works for a same-day order whose offer is
 * still in today's list) and finally to the bare backend fields alone —
 * never to a fabricated value.
 */
export interface PurchaseSnapshot {
  storeName: string;
  storeDistrict: string;
  bagTitle: string;
  coverImageUrl: string | null;
  pickupStartAt: string;
  pickupEndAt: string;
}

const KEY_PREFIX = "kurtar.purchaseSnapshot.";

export async function savePurchaseSnapshot(
  reservationId: string,
  snapshot: PurchaseSnapshot,
): Promise<void> {
  await AsyncStorage.setItem(
    `${KEY_PREFIX}${reservationId}`,
    JSON.stringify(snapshot),
  );
}

export async function getPurchaseSnapshot(
  reservationId: string,
): Promise<PurchaseSnapshot | null> {
  const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${reservationId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PurchaseSnapshot;
  } catch {
    return null;
  }
}
