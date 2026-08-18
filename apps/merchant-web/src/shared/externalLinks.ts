/**
 * Origin of the `landing` app (Task 13, Next.js) — the ONLY place the
 * platform's legal documents (Aracılık Sözleşmesi, etc.) actually exist
 * as published text (landing/content/legal/). Dev default matches
 * `landing`'s fixed dev port (docs/frontend-contract.md's port table);
 * a real deploy should set VITE_LANDING_URL explicitly (see
 * .env.example).
 */
const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? "http://localhost:3000";

/** Absolute URL to a published legal document on `landing`, e.g.
 * `legalDocumentUrl("aracilik-sozlesmesi")` -> ".../tr/yasal/aracilik-sozlesmesi".
 * merchant-web ships Turkish only (src/i18n/locales/ has just `tr`), so the
 * locale segment is fixed rather than derived from an i18n language state. */
export function legalDocumentUrl(slug: string): string {
  return `${LANDING_URL}/tr/yasal/${slug}`;
}
