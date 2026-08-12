import { randomInt } from "crypto";

// Deliberately excludes 0/O/1/I — the classic ambiguous-glyph set that's
// hard to tell apart when read aloud at a pickup counter or printed small.
export const RESERVATION_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const RESERVATION_CODE_PREFIX = "K-";
export const RESERVATION_CODE_SUFFIX_LENGTH = 4;

/**
 * Generate one candidate pickup code, e.g. "K-7F3M". Not guaranteed
 * unique — the caller (ReservationsService) retries on a `code` unique-
 * constraint violation, regenerating a fresh candidate each attempt.
 */
export function generateReservationCode(): string {
  let suffix = "";
  for (let i = 0; i < RESERVATION_CODE_SUFFIX_LENGTH; i++) {
    suffix +=
      RESERVATION_CODE_ALPHABET[randomInt(RESERVATION_CODE_ALPHABET.length)];
  }
  return `${RESERVATION_CODE_PREFIX}${suffix}`;
}
