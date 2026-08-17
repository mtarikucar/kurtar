/**
 * ============================================================================
 * DRAFT — NOT LEGAL ADVICE — REQUIRES A LAWYER'S REVIEW BEFORE LAUNCH
 * ============================================================================
 * Pre-contract information form ("Ön Bilgilendirme Formu") for a Surprise
 * Bag purchase — the specific document task-13's brief calls out by name
 * as needing to cover "contents unknown by design, allergen warning, no
 * withdrawal right for perishables, pickup window rules." All four are
 * covered explicitly below (Articles 3, 4, 6, 5 respectively), each
 * grounded in the same backend mechanics cited in mesafeli-satis-
 * sozlesmesi.ts's file comment (2-hour cancellation deadline, no-show
 * forfeits the payment, mandatory per-bag allergen text).
 *
 * See content/legal/aracilik-sozlesmesi.ts's top-of-file comment and
 * legal/README.md for what this whole directory still needs before
 * publication.
 * ============================================================================
 */
import type { LegalDocument } from "./types";

export const onBilgilendirmeFormu: LegalDocument = {
  slug: "on-bilgilendirme-formu",
  title: {
    tr: "Ön Bilgilendirme Formu",
    en: "Pre-Contract Information Form",
  },
  description: {
    tr: "Bir sürpriz paket satın almadan önce bilmeniz gereken her şey: içerik neden bilinmez, alerjen uyarısı, cayma hakkı istisnası, teslim penceresi kuralları.",
    en: "Everything you should know before buying a surprise bag: why the contents aren't known in advance, the allergen warning, the withdrawal-right exception, and pickup window rules.",
  },
  versionLabel: {
    tr: "v0.1 — 15 Ağustos 2026",
    en: "v0.1 — 15 August 2026",
  },
  intro: {
    tr: [
      "6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca, bir Sürpriz Paket rezervasyonu tamamlanmadan önce aşağıdaki hususlar hakkında bilgilendirilirsiniz. Bu form, Mesafeli Satış Sözleşmesi'nin ayrılmaz bir parçasıdır ve rezervasyon onayından önce elektronik ortamda sunulur.",
    ],
    en: [
      "Under Law No. 6502 on the Protection of Consumers and the Distance Contracts Regulation, you are informed of the following before completing a Surprise Bag reservation. This form is an integral part of the Distance Selling Agreement and is presented electronically before you confirm a reservation.",
    ],
  },
  blocks: {
    tr: [
      {
        heading: "1. Satıcı ve Aracı Platform Bilgileri",
        paragraphs: [
          "Sürpriz Paket'i satan işletmenin unvanı, adresi ve iletişim bilgileri, rezervasyon ekranında görüntülenir. kurtar, bu satışta yalnızca aracı hizmet sağlayıcı sıfatıyla yer alır; satıcı sıfatı işletmeye aittir.",
        ],
      },
      {
        heading: "2. Ürünün Temel Nitelikleri ve Fiyatı",
        paragraphs: [
          "Sürpriz Paket'in kategorisi (fırın, pastane, kafe, restoran, manav), tahmini içerik değer bandı ve KDV dahil satış fiyatı rezervasyon öncesinde açıkça gösterilir.",
        ],
      },
      {
        heading: "3. İçerik Önceden Bilinmez — Bu Bir Tasarım Kararıdır",
        paragraphs: [
          "Sürpriz Paket içeriğinin tam listesi, satın alma anında belirli değildir ve rezervasyon onaylandıktan sonra da değişebilir. Bu belirsizlik bir eksiklik değil, ürünün doğasından kaynaklanır: işletme, gün sonunda elinde kalacak taze ürünü sabahtan kesin olarak bilemez. Bildiğiniz bilgiler; kategori, tahmini değer bandı ve varsa diyet etiketleridir (vejetaryen, vegan, glutensiz, laktozsuz). Tam ürün listesini bilmeden satın alma işlemini onaylamış olursunuz.",
        ],
      },
      {
        heading: "4. Alerjen Uyarısı",
        paragraphs: [
          "Her Sürpriz Paket ilanında, ilgili işletme tarafından girilen bir alerjen uyarı metni bulunur. Alerjiniz veya gıda intoleransınız varsa, satın almadan önce bu uyarıyı mutlaka okuyun. Alerjen bilgisinin doğruluğundan işletme sorumludur; şüpheniz varsa satın almadan önce işletmeyle doğrudan iletişime geçmenizi öneririz.",
        ],
      },
      {
        heading: "5. Teslim Penceresi Kuralları",
        paragraphs: [
          "Her Sürpriz Paket'in belirli bir Teslim Penceresi (saat aralığı) vardır; bu aralık rezervasyon sırasında açıkça belirtilir. Paketinizi yalnızca bu aralık içinde, işletmenin belirttiği adresten, uygulamadaki kodunuzu göstererek teslim alabilirsiniz.",
          "Teslim Penceresi içinde paketinizi teslim almazsanız (\"gelmeme\"), rezervasyon tamamlanmış sayılır ve ödediğiniz tutar iade edilmez. Bu kural, işletmenin sizin için ayırdığı ürünü başka bir müşteriye satamamasının karşılığıdır.",
        ],
      },
      {
        heading: "6. Cayma Hakkının Uygulanmadığı Hususu",
        paragraphs: [
          "Sürpriz Paket, çabuk bozulabilen taze bir gıda ürünüdür. Mesafeli Sözleşmeler Yönetmeliği'nin cayma hakkına ilişkin istisnaları kapsamında, bu tür ürünlerde tüketiciye tanınan genel 14 günlük cayma hakkı uygulanmaz.",
          "Bunun yerine, Teslim Penceresi'nin başlamasına en geç 2 (iki) saat kalana kadar rezervasyonunuzu hiçbir gerekçe göstermeden ücretsiz iptal edebilir, ödediğiniz tutarın tamamını iade olarak alabilirsiniz. Bu süre geçtikten sonra iptal talebi kabul edilmez.",
        ],
      },
      {
        heading: "7. Ödeme Şekli ve Zamanı",
        paragraphs: [
          "Sürpriz Paket bedeli, rezervasyon onayı anında ödeme aracınızdan tahsil edilir. Rezervasyon iptal edilirse, Madde 6'da belirtilen süre içinde yapılan iptallerde tutar aynı ödeme aracına iade edilir.",
        ],
      },
      {
        heading: "8. Şikayet Hakkı",
        paragraphs: [
          "Teslim aldığınız Sürpriz Paket'e ilişkin bir şikayetiniz varsa, uygulama üzerinden iletebilirsiniz; şikayetiniz en geç 15 gün içinde sonuçlandırılır. Ayrıca mevzuatta öngörülen parasal sınırlar dahilinde Tüketici Hakem Heyetleri'ne veya Tüketici Mahkemeleri'ne başvurma hakkınız saklıdır.",
        ],
      },
      {
        heading: "9. Onay",
        paragraphs: [
          "Rezervasyonu onaylayarak, işbu Ön Bilgilendirme Formu'nu ve Mesafeli Satış Sözleşmesi'ni okuduğunuzu, içeriğin sürpriz olduğunu, alerjen uyarısını, Teslim Penceresi kurallarını ve cayma hakkının uygulanmadığını anladığınızı beyan etmiş olursunuz.",
        ],
      },
    ],
    en: [
      {
        heading: "1. Seller and Intermediary Platform Information",
        paragraphs: [
          "The legal name, address, and contact details of the business selling the Surprise Bag are shown on the reservation screen. kurtar acts solely as an intermediary service provider in this sale; the role of seller belongs to the business.",
        ],
      },
      {
        heading: "2. Essential Characteristics and Price",
        paragraphs: [
          "The Surprise Bag's category (bakery, pâtisserie, café, restaurant, greengrocer), its estimated content value band, and its VAT-included sale price are shown clearly before you reserve.",
        ],
      },
      {
        heading: "3. The Contents Aren't Known in Advance — By Design",
        paragraphs: [
          "The exact list of items in a Surprise Bag is not fixed at the time of purchase, and may still vary after your reservation is confirmed. This uncertainty isn't a shortcoming — it follows from the nature of the product: a business cannot know with certainty, first thing in the morning, exactly what fresh surplus it will have left by closing. What you do know: the category, an estimated value band, and any diet flags (vegetarian, vegan, gluten-free, lactose-free). You confirm the purchase without knowing the exact item list.",
        ],
      },
      {
        heading: "4. Allergen Warning",
        paragraphs: [
          "Every Surprise Bag listing carries an allergen warning text entered by the relevant business. If you have an allergy or food intolerance, read this warning carefully before purchasing. The business is responsible for the accuracy of the allergen information; if you're unsure, we recommend contacting the business directly before you buy.",
        ],
      },
      {
        heading: "5. Pickup Window Rules",
        paragraphs: [
          "Every Surprise Bag has a specific Pickup Window (a time range), stated clearly at the time of reservation. You may collect your bag only within that window, at the address the business states, by showing your code in the app.",
          "If you don't collect your bag within the Pickup Window (a \"no-show\"), the reservation is deemed complete and the amount you paid is not refunded. This rule is what lets a business set aside a product for you without being able to sell it to someone else.",
        ],
      },
      {
        heading: "6. Where the Right of Withdrawal Doesn't Apply",
        paragraphs: [
          "A Surprise Bag is a fresh, perishable food product. Under the exceptions to the right of withdrawal set out in the Distance Contracts Regulation, the general 14-day statutory right of withdrawal does not apply to this kind of product.",
          "Instead, you may cancel your reservation for free, without giving any reason, and receive a full refund, up until 2 (two) hours before the Pickup Window begins. Cancellation requests are not accepted after that point.",
        ],
      },
      {
        heading: "7. Payment Method and Timing",
        paragraphs: [
          "The Surprise Bag price is charged to your payment method the moment you confirm the reservation. If you cancel within the period stated in Section 6, the amount is refunded to the same payment method.",
        ],
      },
      {
        heading: "8. Right to Complain",
        paragraphs: [
          "If you have a complaint about a Surprise Bag you received, you can submit it through the app; your complaint is resolved within 15 days at the latest. You also retain the right to apply to Consumer Arbitration Committees or Consumer Courts, within the monetary limits set by legislation.",
        ],
      },
      {
        heading: "9. Acknowledgement",
        paragraphs: [
          "By confirming your reservation, you acknowledge that you have read this Pre-Contract Information Form and the Distance Selling Agreement, and that you understand the contents are a surprise, the allergen warning, the Pickup Window rules, and that the right of withdrawal does not apply.",
        ],
      },
    ],
  },
};
