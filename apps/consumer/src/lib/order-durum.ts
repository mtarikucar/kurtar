import { kalanDakika, type KepenkDurumu } from "../components/kepenk/olcum";

/**
 * Reuses `<ZamanHapi>` (the offer card's own time pill, spec §3) for a
 * CONFIRMED order's pickup countdown — the semantics genuinely match: a
 * reservation's pickup window closing is the same kind of clock as an
 * offer's shutter coming down, just anchored to `pickupStartAt`/
 * `pickupEndAt` instead of the offer's own window. `ZamanHapi` only reads
 * two things from `KepenkDurumu` — "hasn't opened yet" vs "counting down"
 * — so `tukendi` never appears here: an order the merchant hasn't yet
 * flipped past the window still reads as "0 dk", not "tükendi", which
 * would falsely claim the order itself is gone.
 */
export function siparisPillDurumu(simdi: Date, pickupStartAt: string): KepenkDurumu {
  return simdi.getTime() < new Date(pickupStartAt).getTime() ? "acilmadi" : "acik";
}

export function siparisKalanDakika(simdi: Date, pickupEndAt: string): number {
  return kalanDakika(simdi, new Date(pickupEndAt));
}
