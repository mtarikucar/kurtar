/**
 * ============================================================================
 * DRAFT — NOT LEGAL ADVICE — REQUIRES A LAWYER'S REVIEW BEFORE LAUNCH
 * ============================================================================
 * Cookie policy, written to reflect what this Next.js site ACTUALLY sets
 * today — not a generic boilerplate list padded with analytics/marketing
 * categories that don't exist yet. As of this writing, landing/ has no
 * analytics, advertising, or tracking integration; the only cookie is
 * next-intl's own locale-preference cookie (NEXT_LOCALE), set by
 * middleware.ts's createMiddleware(routing) to remember a visitor's
 * chosen language across visits — see next-intl's own documentation for
 * that default behavior. If analytics/marketing tooling is added later,
 * this document (Article 3's table in particular) MUST be updated in the
 * same change, and a consent mechanism added for any non-essential
 * cookie before it is set — this file's current "no analytics/marketing
 * cookies" claim would otherwise go stale silently.
 *
 * See content/legal/aracilik-sozlesmesi.ts's top-of-file comment and
 * legal/README.md for the directory-wide notice.
 * ============================================================================
 */
import type { LegalDocument } from "./types";

export const cerezPolitikasi: LegalDocument = {
  slug: "cerez-politikasi",
  title: {
    tr: "Çerez Politikası",
    en: "Cookie Policy",
  },
  description: {
    tr: "kurtar web sitesinin kullandığı çerezler ve bunları nasıl yönetebileceğiniz hakkında bilgi.",
    en: "What cookies the kurtar website uses, and how you can manage them.",
  },
  versionLabel: {
    tr: "v0.1 — 15 Ağustos 2026",
    en: "v0.1 — 15 August 2026",
  },
  intro: {
    tr: [
      "Bu Çerez Politikası, kurtar web sitesini (kurtar.app ve alt alan adları) ziyaret ettiğinizde tarayıcınıza kaydedilen çerezleri açıklar. Politika, sitenin fiilen kullandığı çerezleri yansıtır; kullanılmayan bir çerez kategorisi burada listelenmez.",
    ],
    en: [
      "This Cookie Policy explains the cookies stored in your browser when you visit the kurtar website (kurtar.app and its subdomains). It reflects the cookies the site actually uses; a category of cookie that isn't in use isn't listed here.",
    ],
  },
  blocks: {
    tr: [
      {
        heading: "1. Çerez Nedir?",
        paragraphs: [
          "Çerez, ziyaret ettiğiniz bir web sitesinin tarayıcınıza kaydettiği, sonraki ziyaretlerinizde okunabilen küçük bir metin dosyasıdır.",
        ],
      },
      {
        heading: "2. Bu Sitede Kullanılan Çerezler",
        paragraphs: [
          "Zorunlu çerez — NEXT_LOCALE: Sitedeki dil tercihinizi (Türkçe/İngilizce) hatırlamak için kullanılır. Bu çerez olmadan site çalışmaya devam eder, ancak her ziyaretinizde tarayıcınızın dil ayarına göre yeniden dil tespiti yapılır. Süresi: tarayıcı bazında değişir, genellikle bir yıla kadar. Bu çerez, sitenin temel işlevi (doğru dilde içerik sunma) için gerekli olduğundan açık rızanız aranmaksızın kullanılabilir.",
          "Şu anda bu sitede analitik (ör. Google Analytics), reklam/hedefleme veya üçüncü taraf pazarlama çerezi kullanılmamaktadır.",
        ],
      },
      {
        heading: "3. İleride Eklenebilecek Çerezler",
        paragraphs: [
          "Site zaman içinde analitik veya pazarlama amaçlı çerezler kullanmaya başlarsa, bu Politika güncellenir ve zorunlu olmayan çerezler için ziyaretçilerden site üzerinde açık bir onay mekanizmasıyla rıza alınır. Mevcut haliyle bu sitede onay istenmesini gerektiren bir çerez bulunmamaktadır.",
        ],
      },
      {
        heading: "4. Çerezleri Nasıl Yönetebilirsiniz?",
        paragraphs: [
          "Çoğu tarayıcı, çerezleri tarayıcı ayarlarından görüntülemenize, silmenize veya engellemenize izin verir. NEXT_LOCALE çerezini engellemeniz, yalnızca dil tercihinizin hatırlanmamasına yol açar; sitenin diğer işlevlerini etkilemez.",
        ],
      },
      {
        heading: "5. İletişim",
        paragraphs: [
          "Bu Politika hakkında sorularınız için [İLETİŞİM KANALI — TBD] üzerinden bize ulaşabilirsiniz.",
        ],
      },
    ],
    en: [
      {
        heading: "1. What Is a Cookie?",
        paragraphs: [
          "A cookie is a small text file a website you visit stores in your browser, which can be read again on your later visits.",
        ],
      },
      {
        heading: "2. Cookies Used on This Site",
        paragraphs: [
          "Strictly necessary — NEXT_LOCALE: used to remember your language preference (Turkish/English) on the site. Without this cookie the site still works, but your language is re-detected from your browser's settings on every visit. Duration: varies by browser, typically up to one year. Because this cookie is necessary for a core function of the site (serving content in the right language), it may be used without seeking your explicit consent.",
          "This site currently uses no analytics (e.g. Google Analytics), advertising/targeting, or third-party marketing cookies.",
        ],
      },
      {
        heading: "3. Cookies That May Be Added Later",
        paragraphs: [
          "If the site begins using analytics or marketing cookies in the future, this Policy will be updated, and an explicit on-site consent mechanism will be added for any non-essential cookie before it is set. As it stands today, this site has no cookie that requires consent.",
        ],
      },
      {
        heading: "4. Managing Cookies",
        paragraphs: [
          "Most browsers let you view, delete, or block cookies through their settings. Blocking the NEXT_LOCALE cookie only means your language preference won't be remembered; it doesn't affect any other function of the site.",
        ],
      },
      {
        heading: "5. Contact",
        paragraphs: [
          "For questions about this Policy, you can reach us via [CONTACT CHANNEL — TBD].",
        ],
      },
    ],
  },
};
