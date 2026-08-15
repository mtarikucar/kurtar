import { useEffect, useState } from "react";
import { useReservations } from "./use-reservations";
import { useStoreProfile } from "./use-discovery";
import { getPurchaseSnapshot, type PurchaseSnapshot } from "../lib/purchase-cache";
import { derivePickupStartAt } from "../lib/constants";
import type { ReservationItem } from "../lib/api-types";

export interface OrderDetails {
  reservation: ReservationItem;
  storeName: string;
  storeDistrict: string | null;
  bagTitle: string | null;
  coverImageUrl: string | null;
  pickupStartAt: string;
  /** null when neither the local purchase snapshot nor a live same-day
   * store lookup could recover it — see purchase-cache.ts's doc comment. */
  pickupEndAt: string | null;
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

  if (snapshot) {
    return {
      data: {
        reservation,
        storeName: snapshot.storeName,
        storeDistrict: snapshot.storeDistrict,
        bagTitle: snapshot.bagTitle,
        coverImageUrl: snapshot.coverImageUrl,
        pickupStartAt: snapshot.pickupStartAt,
        pickupEndAt: snapshot.pickupEndAt,
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
        pickupStartAt:
          typeof liveOffer.pickupStartAt === "string"
            ? liveOffer.pickupStartAt
            : new Date(liveOffer.pickupStartAt).toISOString(),
        pickupEndAt:
          typeof liveOffer.pickupEndAt === "string"
            ? liveOffer.pickupEndAt
            : new Date(liveOffer.pickupEndAt).toISOString(),
      },
      isLoading: false,
    };
  }

  // Last resort: only the bare backend fields, plus the mathematically
  // exact pickup-start derivation (see constants.ts) — never a
  // fabricated store name/title.
  return {
    data: {
      reservation,
      storeName: storeProfileQuery.data?.store.name ?? "Mağaza",
      storeDistrict: storeProfileQuery.data?.store.district ?? null,
      bagTitle: null,
      coverImageUrl: storeProfileQuery.data?.store.coverImageUrl ?? null,
      pickupStartAt: derivePickupStartAt(reservation.cancelDeadlineAt).toISOString(),
      pickupEndAt: null,
    },
    isLoading:
      reservationsQuery.isLoading ||
      (needsLiveFallback ? storeProfileQuery.isLoading : false),
  };
}
