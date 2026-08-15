import { KurtarApiError } from "@kurtar/api-client";

export function isApiError(err: unknown): err is KurtarApiError {
  return err instanceof KurtarApiError;
}

/**
 * A DISPLAY-ONLY fallback string for a toast/banner when a screen has no
 * `errorCode`-specific translation for the error it just received. Every
 * branching decision in this app (which message to show, which UI to
 * render) switches on `.errorCode` — see docs/frontend-contract.md's
 * "Branch on errorCode, never message text" rule — this function is never
 * used to make a decision, only to have SOMETHING to show when the code is
 * unrecognized.
 */
export function fallbackErrorMessage(err: unknown): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
