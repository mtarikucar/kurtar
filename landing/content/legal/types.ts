export interface LegalBlock {
  heading?: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: string;
  title: { tr: string; en: string };
  description: { tr: string; en: string };
  /**
   * A neutral version/date stamp, rendered ON the page (e.g. "v0.1 — 12
   * Ağustos 2026") — ordinary practice for any legal document, reviewed
   * or not. MUST NOT say anything about review/approval status (no
   * "taslak", "draft", "not reviewed", etc.) — task-13 brief requires
   * that specific warning to live "in the repo (not on the rendered
   * page)" only; see each document file's own top-of-file comment, and
   * legal/README.md, for that notice instead. Keeping any review-status
   * language out of this field is what keeps the two notices from
   * blurring into one.
   */
  versionLabel: { tr: string; en: string };
  intro: { tr: string[]; en: string[] };
  blocks: { tr: LegalBlock[]; en: LegalBlock[] };
}
