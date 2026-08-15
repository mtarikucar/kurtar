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

export const RESERVATION_STATUS_LABEL: Record<ReservationStatusValue, string> =
  {
    PENDING_PAYMENT: "Ödeme bekleniyor",
    CONFIRMED: "Teslim bekleniyor",
    REDEEMED: "Teslim edildi",
    CANCELLED_BY_USER: "Müşteri iptal etti",
    CANCELLED_BY_MERCHANT: "İşletme iptal etti",
    NO_SHOW: "Gelinmedi",
    EXPIRED: "Süresi doldu",
  };
