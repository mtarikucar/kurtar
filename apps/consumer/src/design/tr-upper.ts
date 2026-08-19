/**
 * Turkish casing — spec §1.2, the rule that breaks everything if missed.
 *
 * `'ı'.toUpperCase()` is `I` and `'istanbul'.toUpperCase()` is `ISTANBUL`,
 * not `İSTANBUL`; `textTransform: 'uppercase'` is worse, because it is not
 * locale-aware at all — Android applies the DEVICE locale and iOS applies
 * a non-localised uppercase, so a Turkish UI on an English-locale phone
 * mis-cases the brand's own tabela. Hermes cannot be trusted to ship full
 * ICU either, which rules out `toLocaleUpperCase('tr')`.
 *
 * So: static UI strings ship pre-uppercased from tr.json, and dynamic
 * strings (shop names out of the DB) go through this one helper.
 */
const TR_HARITA: Record<string, string> = {
  i: "İ",
  ı: "I",
  ğ: "Ğ",
  ü: "Ü",
  ş: "Ş",
  ö: "Ö",
  ç: "Ç",
};

export const trUpper = (s: string): string =>
  s.replace(/[iığüşöç]/g, (c) => TR_HARITA[c] ?? c).toUpperCase();
