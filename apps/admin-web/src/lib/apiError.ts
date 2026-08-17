import type { TFunction } from "i18next";
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
 * unrecognized. Always Turkish, never the raw backend message.
 *
 * Routed through i18next's `common` namespace (`errors.generic`/
 * `errors.network` in locales/tr/common.json) — same pattern as
 * merchant-web's `getErrorMessage(err, t)` (src/shared/errors.ts) and the
 * consumer app's `getErrorMessage` — rather than a second, hand-copied
 * pair of Turkish strings living outside the i18n system, which had
 * already drifted from common.json's own wording before this fix.
 */
export function fallbackErrorMessage(err: unknown, t: TFunction): string {
  if (isApiError(err) && err.isNetworkError) return t("common:errors.network");
  return t("common:errors.generic");
}
