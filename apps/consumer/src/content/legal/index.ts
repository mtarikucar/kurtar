/**
 * [I11/I13 fix] Verbatim copy of landing/content/legal/* — the ONLY place
 * a Turkish consumer actually forms a contract is this app (landing has
 * no checkout), so it needs the real ÖBF/MSS/etc. text, not the
 * placeholder that used to render here. Kept as a copy rather than a
 * shared workspace package for this round (Expo/Metro vs. Next.js
 * resolution risk on an unrelated, already-shipped surface wasn't worth
 * taking under this round's scope) — if these documents are ever edited
 * after the pending lawyer review, both this directory AND
 * landing/content/legal/ need the same change. All five are still drafts
 * pending that review (see README.md here and there); nothing below is
 * new legal text — it is reproduced from the existing drafts, not
 * authored fresh.
 */
import type { LegalDocument } from "./types";
import { aracilikSozlesmesi } from "./aracilik-sozlesmesi";
import { mesafeliSatisSozlesmesi } from "./mesafeli-satis-sozlesmesi";
import { onBilgilendirmeFormu } from "./on-bilgilendirme-formu";
import { kvkkAydinlatmaMetni } from "./kvkk-aydinlatma-metni";
import { cerezPolitikasi } from "./cerez-politikasi";

export type { LegalDocument, LegalBlock } from "./types";

/** Every legal document in display/nav order. See README.md in this
 * directory — all five are drafts pending a lawyer's review before launch. */
export const legalDocuments: LegalDocument[] = [
  aracilikSozlesmesi,
  mesafeliSatisSozlesmesi,
  onBilgilendirmeFormu,
  kvkkAydinlatmaMetni,
  cerezPolitikasi,
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return legalDocuments.find((doc) => doc.slug === slug);
}
