import type { OfferStatus } from "../api/response-types";
import type { StatusTone } from "./ui/StatusPill";

/** Shared by today/OfferCard.tsx and calendar/CalendarPage.tsx so an offer
 * in a given status always reads the same color everywhere in the app. */
export const OFFER_STATUS_TONE: Record<OfferStatus, StatusTone> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  PUBLISHED: "success",
  SOLD_OUT: "warning",
  CLOSED: "neutral",
  CANCELLED: "danger",
};
