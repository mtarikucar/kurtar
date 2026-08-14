import { randomBytes } from "crypto";

export const MERCHANT_OID_PREFIX = "KRV";

/**
 * Mint an unguessable merchantOid for a reservation's Payment intent.
 * Shape: KRV<reservationId fragment(12)><base36 timestamp><6 hex random>.
 * Port of kds's backend/src/modules/customer-orders/services/self-pay-merchant-oid.util.ts
 * shape ("SP"+tenantHex+ts+rand) — "SP" becomes "KRV", tenantId becomes
 * reservationId since kurtar has no tenant concept at this layer. The
 * reservationId fragment keeps OIDs roughly grouped for log triage; the
 * timestamp+random suffix is what actually makes each OID unique and
 * unguessable (Payment.merchantOid carries its own DB unique constraint,
 * so a collision here is rejected loudly, not silently overwritten).
 */
export function generateMerchantOid(reservationId: string): string {
  const idFragment = reservationId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const ts = Date.now().toString(36);
  const rand = randomBytes(3).toString("hex");
  return `${MERCHANT_OID_PREFIX}${idFragment}${ts}${rand}`;
}
