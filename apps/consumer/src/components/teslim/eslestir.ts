import type { VitrinTeklifi } from "../kepenk/VitrinKarti";
import type { DiscoveryOfferItem } from "../../lib/api-types";

/**
 * `GET /discovery/offers`'s row -> the offer card's props.
 *
 * A projection, not a transformation: every field is carried across
 * verbatim, in the API's own units (integer kuruş, ISO instants, metres).
 * Nothing here rounds, converts or re-derives money — the card's own
 * formatters do the presenting, and they do it from the server's numbers.
 */
export function teklifeCevir(satir: DiscoveryOfferItem): VitrinTeklifi {
  return {
    teklifId: satir.offerId,
    dukkanId: satir.store.id,
    dukkanAdi: satir.store.name,
    paketAdi: satir.template.title,
    kategori: satir.template.category,
    fiyatKurus: satir.template.priceCents,
    degerMinKurus: satir.template.originalValueCentsMin,
    degerMaxKurus: satir.template.originalValueCentsMax,
    alisBaslangic: satir.pickupStartAt,
    alisBitis: satir.pickupEndAt,
    kalanAdet: satir.qtyLeft,
    mesafeM: satir.store.distanceM,
  };
}
