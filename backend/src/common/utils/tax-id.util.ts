/**
 * Turkish tax identifier validator — VKN (10 digits, legal entities) or
 * TCKN (11 digits, real persons). Port of kds's
 * backend/src/modules/accounting/e-document-routing.ts's `isValidTaxId`.
 *
 * Note: the task brief describes this as a "VKN/TCKN checksum", but the
 * kds source being ported is a length/format check only — neither VKN nor
 * TCKN's real digit-sum checksum is implemented there. This ports the
 * ACTUAL kds behavior rather than inventing a checksum kds itself doesn't
 * have, per the brief's explicit "port just this util" instruction.
 */
export function isValidTaxId(taxId?: string | null): boolean {
  if (!taxId) return false;
  return /^\d{10}$/.test(taxId) || /^\d{11}$/.test(taxId);
}
