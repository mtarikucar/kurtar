import { Transform, TransformFnParams } from "class-transformer";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

/**
 * Normalize a free-typed phone number to E.164 (e.g. "+905551234567").
 *
 * Port of kds's backend/src/common/dto/normalize-phone.ts. A strict
 * `/^\+?[1-9]\d{1,14}$/`-style regex rejects every natural format a user
 * actually types: spaces, dashes, parens, and the Turkish leading 0
 * ("0555 123 45 67"). Instead we PARSE the input with libphonenumber-js
 * under a default region (TR) and, when it's a valid number, return its
 * canonical E.164 form. An unparseable/invalid value is returned trimmed
 * and unchanged so the downstream validator can reject it with a clear
 * message — this never silently "fixes" garbage into a wrong number.
 */
export function normalizePhoneToE164(
  value: string,
  defaultRegion: CountryCode = "TR",
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultRegion);
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    // libphonenumber can throw on pathological input — fall through.
  }
  return trimmed;
}

/**
 * class-transformer decorator applying {@link normalizePhoneToE164}. Place
 * it BEFORE the `@Matches`/length validators so validation runs against the
 * canonical E.164 value.
 */
export const NormalizePhone = (defaultRegion: CountryCode = "TR") =>
  Transform(({ value }: TransformFnParams) => {
    if (typeof value !== "string") return value;
    const normalized = normalizePhoneToE164(value, defaultRegion);
    return normalized === "" ? undefined : normalized;
  });
