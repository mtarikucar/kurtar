import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Atomic stock claim/release for DailyOffer.qtyReserved. Both operations
 * are single raw UPDATE statements guarded entirely in their WHERE clause
 * — Prisma's query builder can express a plain `qtyReserved: { lte: n }`
 * filter but NOT a column-to-column comparison offset by a variable
 * ("qtyReserved + qty <= qtyTotal"), so this has to be `$executeRaw`. The
 * WHERE clause reads the row's LIVE values at UPDATE time (not a value
 * captured by an earlier SELECT), which is what makes this safe under
 * genuine concurrency: Postgres serializes concurrent UPDATEs against the
 * same row, and a blocked UPDATE re-evaluates its WHERE against the
 * just-committed row once unblocked (EvalPlanQual) — so two racing claims
 * for the last unit can never both succeed, and a claim can never observe
 * a torn/stale qtyReserved.
 *
 * Used by reservations.service.ts (claim, on create) and by every path
 * that gives stock back: reservations.service.ts (cancel),
 * payment-settle.service.ts (webhook/sweeper failure -> expire).
 */
@Injectable()
export class OfferStockService {
  /**
   * Claims `qty` units. Only matches a PUBLISHED offer with enough
   * remaining room; flips the offer to SOLD_OUT in the same statement
   * when this claim exactly fills it. Returns true iff the claim
   * succeeded (a genuine business "sold out" — insufficient room, offer
   * not published, or a nonexistent id — all collapse to `false`; the
   * caller is responsible for turning that into the uniform
   * OFFER_UNAVAILABLE error).
   */
  async claim(tx: TxClient, offerId: string, qty: number): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE "daily_offers"
      SET "qtyReserved" = "qtyReserved" + ${qty},
          "status" = CASE
            WHEN "qtyReserved" + ${qty} = "qtyTotal" THEN 'SOLD_OUT'::"OfferStatus"
            ELSE "status"
          END,
          "updatedAt" = now()
      WHERE "id" = ${offerId}
        AND "status" = 'PUBLISHED'
        AND "qtyReserved" + ${qty} <= "qtyTotal"
    `;
    return affected === 1;
  }

  /**
   * Releases `qty` previously-claimed units. Flips SOLD_OUT back to
   * PUBLISHED in the same statement when the release opens up room again
   * — any other status (CLOSED/CANCELLED/DRAFT/SCHEDULED) is left alone.
   * Guarded by `qtyReserved >= qty` so an accidental double-release can
   * never drive the counter negative from the app side; the
   * `daily_offers_qty_reserved_non_negative` DB CHECK is the last line of
   * defense, but this guard turns a bug into a clean 0-rows-affected
   * result instead of a raw constraint-violation exception escaping the
   * transaction.
   */
  async release(tx: TxClient, offerId: string, qty: number): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE "daily_offers"
      SET "qtyReserved" = "qtyReserved" - ${qty},
          "status" = CASE
            WHEN "status" = 'SOLD_OUT' AND "qtyReserved" - ${qty} < "qtyTotal" THEN 'PUBLISHED'::"OfferStatus"
            ELSE "status"
          END,
          "updatedAt" = now()
      WHERE "id" = ${offerId}
        AND "qtyReserved" >= ${qty}
    `;
    return affected === 1;
  }
}
