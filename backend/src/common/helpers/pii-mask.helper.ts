/**
 * PII masking for log output. Port of kds's
 * backend/src/common/helpers/pii-mask.helper.ts (maskPhone only — kurtar's
 * SMS/OTP layer is the only current consumer).
 *
 * The contract: keep enough of the number for debugging (country-code
 * prefix + last 2 digits) but redact the rest, so a support engineer can
 * still tell two numbers apart in adjacent log lines without seeing the
 * full PII.
 */

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
