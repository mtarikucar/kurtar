/**
 * Turkish IBAN validator for merchant signup (Task 5). Two independent
 * checks, both exported so callers can apply either alone:
 *
 *  - `isValidIbanFormat`: "TR" + 2 check digits + 22 alphanumeric BBAN
 *    characters (26 characters total) — the brief's literal "TR + 24
 *    alnum" shape. In practice Turkey's own BBAN is fully numeric, but the
 *    format check accepts the general ISO 13616 alnum BBAN shape rather
 *    than hard-coding Turkey's stricter convention.
 *  - `isValidIbanChecksum`: the real ISO 7064 MOD97-10 check-digit
 *    algorithm. The brief calls this "optional" — implemented anyway
 *    (it's cheap and catches real typos a format-only check would miss)
 *    and combined into `isValidIban`, the one signup actually calls.
 */

const IBAN_FORMAT = /^TR\d{2}[0-9A-Z]{22}$/;

function normalize(iban: string): string {
  return iban.toUpperCase().replace(/\s+/g, "");
}

export function isValidIbanFormat(iban?: string | null): boolean {
  if (!iban) return false;
  return IBAN_FORMAT.test(normalize(iban));
}

/**
 * ISO 7064 MOD97-10: move the country code + check digits to the end,
 * convert letters to numbers (A=10 .. Z=35), and the whole thing must be
 * congruent to 1 mod 97. Assumes `iban` already passed `isValidIbanFormat`
 * (only digits and A-Z remain, so the letter->number expansion below is
 * total).
 */
export function isValidIbanChecksum(iban: string): boolean {
  const normalized = normalize(iban);
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    (ch.charCodeAt(0) - 55).toString(),
  );
  if (!/^\d+$/.test(numeric)) return false;
  try {
    return BigInt(numeric) % 97n === 1n;
  } catch {
    return false;
  }
}

export function isValidIban(iban?: string | null): boolean {
  if (!iban) return false;
  return isValidIbanFormat(iban) && isValidIbanChecksum(iban);
}
