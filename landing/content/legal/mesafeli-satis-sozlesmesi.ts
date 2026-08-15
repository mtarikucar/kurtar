/**
 * ============================================================================
 * DRAFT — NOT LEGAL ADVICE — REQUIRES A LAWYER'S REVIEW BEFORE LAUNCH
 * ============================================================================
 * Distance selling agreement template for a single kurtar Surprise Bag
 * purchase, written per Turkey's Mesafeli Sözleşmeler Yönetmeliği as it
 * applies to a marketplace-intermediated sale. Grounded in real backend
 * mechanics: the 2-hour-before-pickup cancellation deadline
 * (backend/src/modules/reservations/reservations.service.ts's
 * CANCEL_DEADLINE_BEFORE_PICKUP_MS = 2h), no-show has no refund (same
 * file's redeem-window logic), and the perishable-goods withdrawal
 * exception this document's Article 6 states.
 *
 * See content/legal/aracilik-sozlesmesi.ts's top-of-file comment for what
 * else this whole legal/ directory still needs before publication
 * (contracting entity details, counsel review of every clause below), and
 * legal/README.md for the same notice in one place. This document in
 * particular still needs: the exact PSP name (iyzico/PayTR — see
 * intermediation agreement's Article 8 note) named wherever "payment
 * service provider" appears below, and confirmation that Article 6's
 * withdrawal-exception wording tracks the regulation's current text
 * verbatim (it was drafted from the master plan's summary, not the
 * regulation itself).
 * ============================================================================
 */
import type { LegalDocument } from "./types";

export const mesafeliSatisSozlesmesi: LegalDocument = {
  slug: "mesafeli-satis-sozlesmesi",
  title: {
    tr: "Mesafeli Satış Sözleşmesi",
    en: "Distance Selling Agreement",
  },
  description: {
    tr: "kurtar üzerinden yapılan her sürpriz paket satın alımı için geçerli mesafeli satış sözleşmesi.",
    en: "The distance selling agreement that applies to every surprise bag purchase made through kurtar.",
  },
  versionLabel: {
    tr: "v0.1 — 15 Ağustos 2026",
    en: "v0.1 — 15 August 2026",
  },
  intro: {
    tr: [
      "İşbu Mesafeli Satış Sözleşmesi (\"Sözleşme\"), kurtar mobil uygulaması veya web sitesi (\"Platform\") üzerinden bir Sürpriz Paket rezervasyonu yapan tüketici (\"Alıcı\") ile Sürpriz Paket'i satışa çıkaran işletme (\"Satıcı\") arasında, her bir satın alma işlemi için ayrı ayrı kurulur. Platform, işbu satışta 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında aracı hizmet sağlayıcı sıfatıyla yer alır; satıcı sıfatı Satıcı'ya aittir.",
      "Alıcı, her rezervasyon öncesinde işbu Sözleşme'nin ve Ön Bilgilendirme Formu'nun içeriğini elektronik ortamda onaylamış sayılır; onay anı ve sözleşme sürümü Platform tarafından kayıt altına alınır.",
    ],
    en: [
      "This Distance Selling Agreement (\"Agreement\") is formed separately for each purchase between the consumer who reserves a Surprise Bag through the kurtar mobile application or website (the \"Platform\") (the \"Buyer\") and the business offering that Surprise Bag for sale (the \"Seller\"). The Platform acts as an intermediary service provider in this sale under Law No. 6563 on the Regulation of Electronic Commerce; the role of seller belongs to the Seller.",
      "The Buyer is deemed to have electronically accepted this Agreement and the Pre-Contract Information Form before each reservation; the moment of acceptance and the agreement version are recorded by the Platform.",
    ],
  },
  blocks: {
    tr: [
      {
        heading: "Madde 1 — Konu",
        paragraphs: [
          "İşbu Sözleşme'nin konusu, Alıcı'nın Platform üzerinden elektronik ortamda sipariş verdiği Sürpriz Paket'in satışı ve teslimine ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir.",
        ],
      },
      {
        heading: "Madde 2 — Satıcı Bilgileri",
        paragraphs: [
          "Satıcı'nın unvanı, adresi, vergi kimlik numarası ve iletişim bilgileri, rezervasyon öncesinde ilgili Sürpriz Paket sayfasında ve rezervasyon sonrası gönderilen elektronik onayda Alıcı'ya sunulur.",
        ],
      },
      {
        heading: "Madde 3 — Ürünün Temel Nitelikleri",
        paragraphs: [
          "Sürpriz Paket'in tam içeriği, satın alma anında belirli değildir; Alıcı'ya kategori (fırın, pastane, kafe, restoran, manav vb.), tahmini değer bandı, varsa diyet etiketleri ve zorunlu alerjen uyarı metni gösterilir. Alıcı, işbu içerik belirsizliğini kabul ederek satın alma işlemini gerçekleştirir.",
          "Ürün, taze ve çabuk bozulabilir niteliktedir; belirtilen Teslim Penceresi içinde teslim alınması beklenir.",
        ],
      },
      {
        heading: "Madde 4 — Fiyat ve Ödeme",
        paragraphs: [
          "Sürpriz Paket'in toplam satış fiyatı, ilgili ilan sayfasında KDV dahil olarak gösterilir ve rezervasyon anında Alıcı'nın ödeme aracından tahsil edilir.",
          "Ödeme, Platform'un anlaşmalı olduğu ödeme kuruluşu aracılığıyla güvenli şekilde gerçekleştirilir; kart bilgileri Platform tarafından saklanmaz.",
        ],
      },
      {
        heading: "Madde 5 — Teslimat",
        paragraphs: [
          "Sürpriz Paket, Satıcı'nın işletme adresinde, rezervasyon sırasında belirtilen Teslim Penceresi içinde, Alıcı'nın uygulamada gösterdiği teslim kodunun okutulmasıyla teslim edilir.",
          "Alıcı'nın Teslim Penceresi içinde teslim almaması (\"gelmeme\"), tesliminin gerçekleşmiş sayılmasına ve ödenen bedelin iade edilmemesine yol açar; bu husus Ön Bilgilendirme Formu'nda ayrıca açıkça belirtilir.",
        ],
      },
      {
        heading: "Madde 6 — Cayma Hakkı İstisnası",
        paragraphs: [
          "Sürpriz Paket, çabuk bozulabilen ve/veya son tüketim tarihi kısa süre içinde geçebilecek bir gıda ürünü olması nedeniyle, Mesafeli Sözleşmeler Yönetmeliği'nin cayma hakkının istisnalarını düzenleyen hükümleri kapsamında, Alıcı'nın 14 günlük yasal cayma hakkı bu satışta uygulanmaz.",
          "Bunun yerine Alıcı, rezervasyon sonrası Teslim Penceresi'nin başlangıcından en geç 2 (iki) saat öncesine kadar, hiçbir gerekçe göstermeksizin rezervasyonunu iptal edebilir ve ödediği bedelin tamamını iade olarak alır. Bu süre dolduktan sonra iptal talebi kabul edilmez.",
        ],
      },
      {
        heading: "Madde 7 — Satıcı Kaynaklı İptal",
        paragraphs: [
          "Satıcı'nın stok yetersizliği, işletme kapanışı veya benzer bir sebeple rezervasyonu tek taraflı iptal etmesi halinde, Alıcı'ya ödediği bedelin tamamı gecikmeksizin iade edilir.",
        ],
      },
      {
        heading: "Madde 8 — Şikayet ve Uyuşmazlık Başvurusu",
        paragraphs: [
          "Alıcı, teslim aldığı Sürpriz Paket'e ilişkin şikayetini Platform üzerinden iletebilir; şikayet en geç 15 gün içinde sonuçlandırılır.",
          "Alıcı, mevzuatta öngörülen parasal sınırlar dahilinde İl/İlçe Tüketici Hakem Heyetleri'ne veya Tüketici Mahkemeleri'ne başvurma hakkını saklı tutar.",
        ],
      },
      {
        heading: "Madde 9 — Yürürlük",
        paragraphs: [
          "İşbu Sözleşme, Alıcı'nın rezervasyonu elektronik ortamda onayladığı anda kurulur ve ilgili Sürpriz Paket'in teslimi veya iptaliyle birlikte ifasını tamamlar.",
        ],
      },
    ],
    en: [
      {
        heading: "Article 1 — Subject",
        paragraphs: [
          "The subject of this Agreement is to set out the rights and obligations of the parties regarding the sale and delivery of the Surprise Bag the Buyer orders electronically through the Platform.",
        ],
      },
      {
        heading: "Article 2 — Seller Information",
        paragraphs: [
          "The Seller's legal name, address, tax ID, and contact details are shown to the Buyer on the relevant Surprise Bag listing before reservation, and again in the electronic confirmation sent after reservation.",
        ],
      },
      {
        heading: "Article 3 — Essential Characteristics of the Product",
        paragraphs: [
          "The exact contents of a Surprise Bag are not determined at the time of purchase; the Buyer is shown the category (bakery, pâtisserie, café, restaurant, greengrocer, etc.), an estimated value band, any diet flags, and the mandatory allergen warning text. The Buyer completes the purchase accepting this uncertainty about contents.",
          "The product is fresh and perishable; it is expected to be picked up within the stated Pickup Window.",
        ],
      },
      {
        heading: "Article 4 — Price and Payment",
        paragraphs: [
          "The total sale price of the Surprise Bag, VAT included, is shown on the relevant listing page and charged to the Buyer's payment method at the time of reservation.",
          "Payment is processed securely through the Platform's contracted payment service provider; card details are not stored by the Platform.",
        ],
      },
      {
        heading: "Article 5 — Delivery",
        paragraphs: [
          "The Surprise Bag is handed over at the Seller's business address, within the Pickup Window stated at the time of reservation, by scanning the pickup code shown in the Buyer's app.",
          "If the Buyer does not collect the bag within the Pickup Window (a \"no-show\"), delivery is deemed to have occurred and the amount paid is not refunded; this is stated explicitly again in the Pre-Contract Information Form.",
        ],
      },
      {
        heading: "Article 6 — Withdrawal Right Exception",
        paragraphs: [
          "Because a Surprise Bag is a perishable food product and/or one that may expire within a short period, the Buyer's statutory 14-day right of withdrawal does not apply to this sale, under the provisions of the Distance Contracts Regulation governing exceptions to the right of withdrawal.",
          "Instead, the Buyer may cancel their reservation without giving any reason, and receive a full refund, up until 2 (two) hours before the Pickup Window begins. Cancellation requests are not accepted after that point.",
        ],
      },
      {
        heading: "Article 7 — Seller-Initiated Cancellation",
        paragraphs: [
          "If the Seller unilaterally cancels a reservation due to insufficient stock, business closure, or a similar reason, the full amount paid is refunded to the Buyer without delay.",
        ],
      },
      {
        heading: "Article 8 — Complaints and Dispute Resolution",
        paragraphs: [
          "The Buyer may submit a complaint about a received Surprise Bag through the Platform; complaints are resolved within 15 days at the latest.",
          "The Buyer retains the right to apply to Provincial/District Consumer Arbitration Committees or Consumer Courts, within the monetary limits set by legislation.",
        ],
      },
      {
        heading: "Article 9 — Effective Date",
        paragraphs: [
          "This Agreement is formed the moment the Buyer electronically confirms the reservation, and is fully performed upon delivery or cancellation of the relevant Surprise Bag.",
        ],
      },
    ],
  },
};
