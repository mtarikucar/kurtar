import { KurtarApiError } from "@kurtar/api-client";

export function isApiError(err: unknown): err is KurtarApiError {
  return err instanceof KurtarApiError;
}

// Matches merchant-web's src/shared/errors.ts and the consumer app's
// src/lib/errors.ts — the SAME generic/network Turkish fallback phrasing
// (register adjusted for this app's professional B2B tone) so all three
// non-Expo surfaces read as one voice when an error has no screen-specific
// translation, rather than this one showing a raw, often-English backend
// message (`err.message` is written by NestJS/class-validator and is not
// translated — see docs/frontend-contract.md's "Branch on errorCode, never
// message text" rule, which is exactly why displaying it directly was
// wrong: it was never meant to be user-facing copy).
const GENERIC_ERROR_MESSAGE_TR =
  "Bir şeyler ters gitti. Lütfen tekrar deneyin.";
const NETWORK_ERROR_MESSAGE_TR =
  "İnternet bağlantınızı kontrol edip tekrar deneyin.";

/**
 * A DISPLAY-ONLY fallback string for a toast/banner when a screen has no
 * `errorCode`-specific translation for the error it just received. Every
 * branching decision in this app (which message to show, which UI to
 * render) switches on `.errorCode` — see docs/frontend-contract.md's
 * "Branch on errorCode, never message text" rule — this function is never
 * used to make a decision, only to have SOMETHING to show when the code is
 * unrecognized. Always Turkish, never the raw backend message.
 */
export function fallbackErrorMessage(err: unknown): string {
  if (isApiError(err) && err.isNetworkError) return NETWORK_ERROR_MESSAGE_TR;
  return GENERIC_ERROR_MESSAGE_TR;
}
