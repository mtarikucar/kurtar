import type { TFunction } from "i18next";
import { KurtarApiError } from "../api/client";

/**
 * Maps a caught error to a Turkish, actionable message — branching on
 * `KurtarApiError.errorCode`, NEVER on `.message` (see docs/frontend-
 * contract.md §7/§8: message text is not stable across releases and may be
 * English). Every errorCode this app's screens can plausibly hit has an
 * entry under the `errors` i18n namespace's `codes` key
 * (i18n/locales/tr/errors.json); anything else — a code we haven't
 * special-cased, or a genuinely unexpected one — falls back to a generic
 * toast rather than leaking a raw code or a stack to the merchant.
 */
export function getErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof KurtarApiError) {
    if (err.isNetworkError) return t("errors:network");
    const translated = t(`errors:codes.${err.errorCode}`, { defaultValue: "" });
    if (translated) return translated;
    return t("errors:generic");
  }
  return t("errors:generic");
}

/** Convenience for the one branch nearly every gated screen needs: "did
 * this specific action just get blocked by the approval gate". */
export function isMerchantNotApproved(err: unknown): boolean {
  return (
    err instanceof KurtarApiError && err.errorCode === "MERCHANT_NOT_APPROVED"
  );
}

export function errorCodeOf(err: unknown): string | undefined {
  return err instanceof KurtarApiError ? err.errorCode : undefined;
}
