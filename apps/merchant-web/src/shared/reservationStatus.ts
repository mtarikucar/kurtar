import type { StatusTone } from "./ui/StatusPill";

/** `Reservation.status` (backend/prisma/schema.prisma) — the pickup
 * list's status pill, mirroring offerStatus.ts's tone convention. */
export type ReservationStatusValue =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "REDEEMED"
  | "CANCELLED_BY_USER"
  | "CANCELLED_BY_MERCHANT"
  | "NO_SHOW"
  | "EXPIRED";

export const RESERVATION_STATUS_TONE: Record<
  ReservationStatusValue,
  StatusTone
> = {
  PENDING_PAYMENT: "neutral",
  CONFIRMED: "info",
  REDEEMED: "success",
  CANCELLED_BY_USER: "neutral",
  CANCELLED_BY_MERCHANT: "neutral",
  NO_SHOW: "warning",
  EXPIRED: "neutral",
};

// Labels are NOT hardcoded here (unlike this file's earlier version) — see
// offerStatus.ts's own precedent: this file only owns the non-text tone
// mapping, and every status LABEL is resolved via i18next at the call
// site (`t(\`today:pickup.status.${status}\`)`, mirroring OfferCard.tsx's
// `t(\`today:offerCard.status.${offer.status}\`)`), sourced from
// i18n/locales/tr/today.json's `pickup.status` block.
