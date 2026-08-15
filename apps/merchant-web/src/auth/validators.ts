/**
 * Client-side mirrors of the server's signup validation rules (backend/src/
 * common/utils/tax-id.util.ts, iban.util.ts, and merchants/dto/merchant-
 * signup.dto.ts) — so a merchant sees the SAME rule fail instantly, in
 * Turkish, instead of round-tripping to the server first. The server
 * remains authoritative; these are a UX shortcut, not a security boundary.
 */

/** 10-digit VKN (legal entity) or 11-digit TCKN (real person). */
export function isValidTaxId(taxId: string): boolean {
  return /^\d{10}$/.test(taxId) || /^\d{11}$/.test(taxId);
}

const IBAN_FORMAT = /^TR\d{2}[0-9A-Z]{22}$/;

function normalizeIban(iban: string): string {
  return iban.toUpperCase().replace(/\s+/g, "");
}

function isValidIbanChecksum(iban: string): boolean {
  const normalized = normalizeIban(iban);
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

/** "TR" + 2 check digits + 22 alphanumeric BBAN chars (26 total), AND a
 * valid ISO 7064 MOD97-10 checksum — mirrors backend's isValidIban exactly. */
export function isValidIban(iban: string): boolean {
  const normalized = normalizeIban(iban);
  return IBAN_FORMAT.test(normalized) && isValidIbanChecksum(normalized);
}

export function isValidEmail(email: string): boolean {
  // Deliberately loose (shape only) — the server's @IsEmail is the real
  // gate; this just catches an obviously-wrong value before a round trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}
