import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReservations } from "./use-reservations";
import { useStoreProfile } from "./use-discovery";
import { getPurchaseSnapshot, type PurchaseSnapshot } from "../lib/purchase-cache";
import type { ReservationItem } from "../lib/api-types";

export interface OrderDetails {
  reservation: ReservationItem;
  storeName: string;
  storeDistrict: string | null;
  bagTitle: string | null;
  coverImageUrl: string | null;
  /** [I9 fix] Always the SERVER's own window now — `GET
   * /reservations/mine` returns the reservation's offer window
   * (ReservationDto.pickupStartAt/pickupEndAt), so this no longer depends
   * on a local purchase snapshot or a live same-day store lookup being
   * available. That matters most exactly where it used to fail: a
   * reinstalled device at the counter, and any order from a previous day.
   * `pickupEndAt` is no longer nullable. */
  pickupStartAt: string;
  pickupEndAt: string;
}

/**
 * Combines the bare `GET /reservations/mine` row with whatever enrichment
 * is available (see purchase-cache.ts for why enrichment is needed at
 * all): the local purchase-time snapshot first, then a live
 * `discovery.store()` lookup for a same-day order whose offer is still in
 * today's published list, then the bare fields alone as a last resort.
 * Never blocks on the network for the parts it already has locally.
 */
export function useOrderDetails(reservationId: string): {
  data: OrderDetails | null;
  isLoading: boolean;
} {
  const { t } = useTranslation();
  const reservationsQuery = useReservations();
  const reservation =
    reservationsQuery.data?.items.find((r) => r.id === reservationId) ?? null;

  const [snapshot, setSnapshot] = useState<PurchaseSnapshot | null>(null);
  const [snapshotChecked, setSnapshotChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSnapshotChecked(false);
    getPurchaseSnapshot(reservationId).then((value) => {
      if (cancelled) return;
      setSnapshot(value);
      setSnapshotChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  const needsLiveFallback = snapshotChecked && !snapshot && reservation;
  const storeProfileQuery = useStoreProfile(
    needsLiveFallback ? reservation.storeId : null,
  );

  if (!reservation) {
    return { data: null, isLoading: reservationsQuery.isLoading };
  }

  // [I9 fix] The window comes from the reservation itself in every
  // branch below — the snapshot/live-offer lookups are now purely about
  // the human ENRICHMENT (store name, bag title, cover image) they were
  // always meant for, never about recovering times the server can state.
  const pickupStartAt = reservation.pickupStartAt;
  const pickupEndAt = reservation.pickupEndAt;

  if (snapshot) {
    return {
      data: {
        reservation,
        storeName: snapshot.storeName,
        storeDistrict: snapshot.storeDistrict,
        bagTitle: snapshot.bagTitle,
        coverImageUrl: snapshot.coverImageUrl,
        pickupStartAt,
        pickupEndAt,
      },
      isLoading: false,
    };
  }

  const liveOffer = storeProfileQuery.data?.todaysOffers.find(
    (o) => o.offerId === reservation.offerId,
  );
  if (liveOffer && storeProfileQuery.data) {
    return {
      data: {
        reservation,
        storeName: storeProfileQuery.data.store.name,
        storeDistrict: storeProfileQuery.data.store.district,
        bagTitle: liveOffer.template.title,
        coverImageUrl: storeProfileQuery.data.store.coverImageUrl,
        pickupStartAt,
        pickupEndAt,
      },
      isLoading: false,
    };
  }

  // Last resort: only the bare backend fields — never a fabricated store
  // name/title. The pickup window is NOT degraded here any more: it comes
  // off the reservation like everywhere else.
  return {
    data: {
      reservation,
      storeName: storeProfileQuery.data?.store.name ?? t("orders.unknownStoreName"),
      storeDistrict: storeProfileQuery.data?.store.district ?? null,
      bagTitle: null,
      coverImageUrl: storeProfileQuery.data?.store.coverImageUrl ?? null,
      pickupStartAt,
      pickupEndAt,
    },
    isLoading:
      reservationsQuery.isLoading ||
      (needsLiveFallback ? storeProfileQuery.isLoading : false),
  };
}
