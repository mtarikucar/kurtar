/**
 * Prints a stored E.164 number the way a person reads it aloud.
 *
 * The profile screen showed `+905551110004` — the shape the database
 * keeps, not the shape anyone recognises as their own number. Turkish
 * mobile numbers group 3-3-2-2 after the country code.
 *
 * Anything that is not a Turkish mobile in E.164 is returned untouched:
 * a half-guessed grouping is worse than the raw digits.
 */
export function telefonuBicimle(e164: string): string {
  const eslesme = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164.trim());
  if (!eslesme) return e164;
  const [, operator, ilk, ikinci, ucuncu] = eslesme;
  return `+90 ${operator} ${ilk} ${ikinci} ${ucuncu}`;
}
