/**
 * PII masking for log output. Port of kds's
 * backend/src/common/helpers/pii-mask.helper.ts — maskPhone (Task 3, SMS/
 * OTP) and maskEmail (Task 7, EmailService's log lines).
 *
 * The contract: keep enough of the value for debugging (country-code
 * prefix + last 2 digits for a phone; first local-part character +
 * full domain for an email) but redact the rest, so a support engineer can
 * still tell two values apart in adjacent log lines without seeing the
 * full PII.
 */

/**
 * Mask an email address for log output.
 *
 *   "a@example.com"        -> "*@example.com"   (1-char local part)
 *   "jane.doe@example.com" -> "j***@example.com"
 *   "not-an-email"         -> "***"              (no '@' -> fully masked)
 *   ""                     -> ""
 */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return "";
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length === 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * Mask a phone number for log output.
 *
 *   "+905551112233"  -> "+90****33"
 *   "+15551112233"   -> "+1****33"
 *   "5551112233"     -> "***33"   (no leading + -> no country code kept)
 *   "abc"            -> "***"     (too short -> fully masked)
 *   ""               -> ""
 */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length < 4) return "***";
  if (trimmed.startsWith("+")) {
    // Cheap rule: keep + plus the first 1-2 digits and the last 2.
    const cc = trimmed.startsWith("+9")
      ? trimmed.slice(0, 3)
      : trimmed.slice(0, 2);
    const tail = trimmed.slice(-2);
    return `${cc}****${tail}`;
  }
  return `***${trimmed.slice(-2)}`;
}

/**
 * [Task 7 fix round] Redact Expo push tokens (`ExponentPushToken[...]` /
 * `ExpoPushToken[...]`) out of arbitrary log text — used on Expo's raw
 * HTTP error response body before logging it (expo-push-provider.ts),
 * which otherwise echoes back every token from the failed request body
 * verbatim. A push token is a durable per-device identifier, not
 * something that belongs in a log line any more than a phone number does.
 *
 *   'to "ExponentPushToken[abc123]" is invalid' -> 'to "ExponentPushToken[***]" is invalid'
 */
export function redactPushTokens(text: string): string {
  return text.replace(/Expo(?:nent)?PushToken\[[^\]]*\]/gi, (match) =>
    match.replace(/\[[^\]]*\]/, "[***]"),
  );
}
