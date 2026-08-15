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
