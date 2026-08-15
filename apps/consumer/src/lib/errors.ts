import { KurtarApiError } from "@kurtar/api-client";
import type { TFunction } from "i18next";

/**
 * Maps any thrown value from an api-client call to Turkish, user-facing
 * copy. Business errors (`err.isBackendErrorCode`) branch on the stable
 * `errorCode` (see docs/frontend-contract.md §8's catalogue, mirrored in
 * i18n's `errors.*` keys); everything else falls back to a status-code
 * bucket, and a non-KurtarApiError to the fully generic message.
 */
export function getErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof KurtarApiError) {
    if (err.isNetworkError) return t("errors.network");
    if (err.isBackendErrorCode) {
      const key = `errors.${err.errorCode}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
    if (err.statusCode === 401) return t("errors.unauthorized");
    if (err.statusCode === 403) return t("errors.forbidden");
    if (err.statusCode === 404) return t("errors.notFound");
    return t("errors.generic");
  }
  return t("errors.generic");
}

/**
 * `POST /auth/otp/request` has no declared errorCode of its own (see
 * otp.service.ts) — every rejection is a plain BadRequestException with an
 * English message, or a 429 from the route's own @Throttle tier. The
 * message text is the ONLY signal that distinguishes "please wait 60s
 * before resending" from "this phone is locked out for failing too many
 * verifications" — both would otherwise collapse to the same derived
 * `errorCode: "BAD_REQUEST"`. Matched defensively (never throws on an
 * unrecognized shape) — see the OTP screen for how each branch drives the
 * UI (a real resend countdown vs. an indeterminate lockout notice).
 */
export type OtpRequestFailure = "cooldown" | "lockout" | "throttled" | "other";

export function classifyOtpRequestError(err: unknown): OtpRequestFailure {
  if (!(err instanceof KurtarApiError)) return "other";
  if (err.statusCode === 429) return "throttled";
  if (err.statusCode === 400) {
    const message = err.message.toLowerCase();
    if (message.includes("wait before requesting")) return "cooldown";
    if (message.includes("too many failed verification")) return "lockout";
  }
  return "other";
}
