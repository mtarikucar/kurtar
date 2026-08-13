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
   * remaining room ON A STORE OWNED BY A CURRENTLY-APPROVED MERCHANT;
   * flips the offer to SOLD_OUT in the same statement when this claim
   * exactly fills it. Returns true iff the claim succeeded (a genuine
   * business "sold out" — insufficient room, offer not published, a
   * nonexistent id, or a non-APPROVED merchant — all collapse to `false`;
   * the caller is responsible for turning that into the uniform
   * OFFER_UNAVAILABLE error, so a probing caller can never distinguish
   * "sold out" from "this merchant is suspended").
   *
   * The merchant-approval EXISTS subquery closes the same hole
   * discovery.service.ts's `m."verificationStatus" = 'APPROVED'` filter
   * closes for reads (see that file's doc comment): the suspend
   * kill-switch (modules/merchants -> ReservationsService.cancelAllForOffer)
   * is a one-shot best-effort sweep over that merchant's ACTIVE offers at
   * the moment of suspension — if any single offer's cancel faults, or the
   * process crashes mid-sweep, that one offer is left PUBLISHED with no
   * further attempt to fix it. Without a standing gate HERE, at the actual
   * money-taking statement, that leftover PUBLISHED row would stay
   * directly bookable by anyone who already holds its offerId, indefinitely
   * — discovery no longer surfaces it, but nothing stops a direct
   * POST /reservations against a known id. The subquery re-reads the
   * merchant's LIVE verificationStatus at UPDATE time (same EvalPlanQual
   * reasoning as the rest of this WHERE clause), so it can never claim
   * against a stale "was approved when the offer was published" snapshot.
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
        AND EXISTS (
          SELECT 1
          FROM "stores" s
          JOIN "merchants" m ON m."id" = s."merchantId"
          WHERE s."id" = "daily_offers"."storeId"
            AND m."verificationStatus" = 'APPROVED'
        )
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
