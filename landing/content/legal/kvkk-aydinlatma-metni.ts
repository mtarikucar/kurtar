/**
 * ============================================================================
 * DRAFT — NOT LEGAL ADVICE — REQUIRES A LAWYER'S REVIEW BEFORE LAUNCH
 * ============================================================================
 * KVKK (6698 sayılı Kişisel Verilerin Korunması Kanunu) aydınlatma metni
 * draft. The categories of personal data listed in Article 2 are drawn
 * from the actual Prisma schema (backend/prisma/schema.prisma) — User
 * (phoneE164), Merchant (legalName/taxId/iban/kepAddress), Store
 * (latitude/longitude), Reservation, Rating, ComplaintTicket,
 * ImpactLedger, PushToken/NotificationPreference — not a generic
 * boilerplate list. Still needed before publication: the data controller
 * (veri sorumlusu)'s exact legal-entity details, VERBİS registration
 * status, the identity of any sub-processor (SMS provider, payment
 * provider, hosting) actually contracted at launch, and counsel
 * confirmation that the "explicit consent" vs. "legitimate interest"
 * legal-basis mapping in Article 3 is correct per KVKK Art. 5.
 *
 * See content/legal/aracilik-sozlesmesi.ts's top-of-file comment and
 * legal/README.md for the directory-wide notice.
 * ============================================================================
 */
import type { LegalDocument } from "./types";

export const kvkkAydinlatmaMetni: LegalDocument = {
  slug: "kvkk-aydinlatma-metni",
  title: {
    tr: "KVKK Aydınlatma Metni",
    en: "Privacy Notice (KVKK)",
  },
  description: {
    tr: "kurtar'ın 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verilerinizi nasıl işlediğine dair aydınlatma metni.",
    en: "How kurtar processes your personal data under Turkey's Law No. 6698 on the Protection of Personal Data (KVKK).",
  },
  versionLabel: {
    tr: "v0.1 — 15 Ağustos 2026",
    en: "v0.1 — 15 August 2026",
  },
  intro: {
    tr: [
      "İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu (\"KVKK\") m. 10 uyarınca, [ŞİRKET UNVANI] (\"kurtar\", \"Veri Sorumlusu\") tarafından kurtar mobil uygulaması, web sitesi ve işletme/admin panelleri üzerinden işlenen kişisel verileriniz hakkında sizi bilgilendirmek amacıyla hazırlanmıştır.",
    ],
    en: [
      "This Privacy Notice is prepared under Article 10 of Turkey's Law No. 6698 on the Protection of Personal Data (\"KVKK\") to inform you about the personal data [LEGAL ENTITY NAME] (\"kurtar\", the \"Data Controller\") processes through the kurtar mobile application, website, and business/admin panels.",
    ],
  },
  blocks: {
    tr: [
      {
        heading: "1. Veri Sorumlusu",
        paragraphs: [
          "[ŞİRKET UNVANI], [ADRES], [MERSİS NO] — VERBİS kayıt durumu ve iletişim bilgileri şirket kuruluşu tamamlandığında bu bölüme eklenecektir.",
        ],
      },
      {
        heading: "2. İşlenen Kişisel Veri Kategorileri",
        paragraphs: [
          "Kimlik ve iletişim bilgileri: ad-soyad, telefon numarası (tüketici hesabı için tek kimlik doğrulama yöntemi), e-posta (işletme/admin hesapları için).",
          "İşletme bilgileri: unvan, vergi kimlik numarası, MERSİS numarası, KEP adresi, IBAN — yalnızca işletme hesabı sahipleri için.",
          "Konum bilgisi: yakınınızdaki Sürpriz Paketleri gösterebilmek için cihazınızdan alınan konum verisi; işletmeler için mağaza adresi koordinatları.",
          "İşlem bilgileri: rezervasyon geçmişi, ödeme tutarı ve durumu (kart bilgileri Platform'da saklanmaz, yalnızca ödeme kuruluşu nezdinde işlenir), teslim kodu, değerlendirme ve puanlamalar.",
          "Etki ve tercih verileri: kurtardığınız öğün sayısı, önlenen CO2e gibi hesaplanmış etki verileri; bildirim tercihleri, favori işletmeler, diyet tercihleri.",
          "Şikayet ve destek kayıtları: uygulama üzerinden ilettiğiniz şikayet ve mesajlar.",
          "İşlem güvenliği verileri: IP adresi, cihaz ve oturum bilgileri, push bildirim token'ı.",
        ],
      },
      {
        heading: "3. İşleme Amaçları ve Hukuki Sebepleri",
        paragraphs: [
          "Hesap oluşturma, kimlik doğrulama (telefon OTP) ve oturum yönetimi — KVKK m. 5/2(c) sözleşmenin kurulması/ifası.",
          "Rezervasyon, ödeme, teslimat ve iade süreçlerinin yürütülmesi — KVKK m. 5/2(c) sözleşmenin ifası.",
          "Konuma göre yakındaki Sürpriz Paketlerin gösterilmesi — KVKK m. 5/1 açık rıza (konum izni cihaz düzeyinde ayrıca istenir).",
          "Şikayet ve uyuşmazlık yönetimi — KVKK m. 5/2(ç) hukuki yükümlülüğün yerine getirilmesi (ETAHS kapsamındaki 15 günlük şikayet çözüm yükümlülüğü) ve m. 5/2(e) hakkın tesisi/korunması.",
          "Fatura, hakediş ve stopaj kayıtlarının tutulması — KVKK m. 5/2(ç) vergi ve muhasebe mevzuatından doğan hukuki yükümlülük.",
          "Bildirim gönderimi (push/SMS/e-posta) — KVKK m. 5/1 açık rıza; bildirim tercihlerinizden istediğiniz zaman vazgeçebilirsiniz.",
          "Dolandırıcılık önleme, platform güvenliği ve kötüye kullanımın tespiti — KVKK m. 5/2(f) meşru menfaat.",
        ],
      },
      {
        heading: "4. Kişisel Verilerin Aktarımı",
        paragraphs: [
          "Kişisel verileriniz; ödeme işlemlerinin yürütülmesi için anlaşmalı ödeme kuruluşuna, SMS/OTP gönderimi için SMS operatörüne, e-fatura düzenlenmesi için e-belge entegratörüne ve yasal yükümlülükler kapsamında yetkili kamu kurumlarına, KVKK m. 8 ve m. 9'da öngörülen şartlara uygun olarak aktarılabilir.",
        ],
      },
      {
        heading: "5. Saklama Süresi",
        paragraphs: [
          "Kişisel verileriniz, ilgili işleme amacının gerektirdiği süre boyunca ve her hâlükârda Türk Ticaret Kanunu, Vergi Usul Kanunu ve KVKK'nın öngördüğü yasal saklama süreleri boyunca saklanır. Hesabınızı kapattığınızda, yasal saklama yükümlülüğü bulunmayan veriler silinir veya anonimleştirilir.",
        ],
      },
      {
        heading: "6. KVKK m. 11 Kapsamındaki Haklarınız",
        paragraphs: [
          "Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, KVKK m. 7'deki şartlar çerçevesinde silinmesini/yok edilmesini isteme, düzeltme/silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme, kanuna aykırı işlenme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.",
          "Bu haklarınızı kullanmak için [BAŞVURU KANALI/E-POSTA — TBD] üzerinden bize başvurabilirsiniz.",
        ],
      },
    ],
    en: [
      {
        heading: "1. Data Controller",
        paragraphs: [
          "[LEGAL ENTITY NAME], [ADDRESS], [MERSİS NO] — VERBİS registration status and contact details will be added to this section once the company's incorporation is complete.",
        ],
      },
      {
        heading: "2. Categories of Personal Data Processed",
        paragraphs: [
          "Identity and contact information: full name, phone number (the sole authentication method for consumer accounts), email (for business/admin accounts).",
          "Business information: legal name, tax ID, MERSİS number, KEP address, IBAN — for business account holders only.",
          "Location data: device location used to show you nearby Surprise Bags; store address coordinates for businesses.",
          "Transaction information: reservation history, payment amount and status (card details are not stored by the Platform, only processed by the payment provider), pickup code, ratings and reviews.",
          "Impact and preference data: computed impact figures such as bags rescued and CO2e avoided; notification preferences, favourite businesses, diet preferences.",
          "Complaint and support records: complaints and messages you submit through the app.",
          "Transaction security data: IP address, device and session information, push notification token.",
        ],
      },
      {
        heading: "3. Purposes and Legal Bases for Processing",
        paragraphs: [
          "Account creation, authentication (phone OTP), and session management — KVKK Art. 5/2(c), necessary for the establishment/performance of a contract.",
          "Carrying out reservation, payment, delivery, and refund processes — KVKK Art. 5/2(c), performance of a contract.",
          "Showing nearby Surprise Bags based on location — KVKK Art. 5/1, explicit consent (location permission is additionally requested at the device level).",
          "Complaint and dispute management — KVKK Art. 5/2(ç), compliance with a legal obligation (the 15-day complaint resolution obligation under ETAHS) and Art. 5/2(e), establishment/protection of a right.",
          "Keeping invoice, payout, and withholding records — KVKK Art. 5/2(ç), legal obligation arising from tax and accounting legislation.",
          "Sending notifications (push/SMS/email) — KVKK Art. 5/1, explicit consent; you may withdraw your notification preferences at any time.",
          "Fraud prevention, platform security, and abuse detection — KVKK Art. 5/2(f), legitimate interest.",
        ],
      },
      {
        heading: "4. Transfer of Personal Data",
        paragraphs: [
          "Your personal data may be transferred to the contracted payment provider for processing payments, to the SMS operator for sending SMS/OTP messages, to the e-document integrator for issuing e-invoices, and to authorized public authorities under legal obligations, in accordance with the conditions set out in KVKK Art. 8 and Art. 9.",
        ],
      },
      {
        heading: "5. Retention Period",
        paragraphs: [
          "Your personal data is retained for as long as the relevant processing purpose requires, and in any case for the retention periods mandated by the Turkish Commercial Code, the Tax Procedure Law, and KVKK. When you close your account, data with no legal retention obligation is deleted or anonymized.",
        ],
      },
      {
        heading: "6. Your Rights Under KVKK Art. 11",
        paragraphs: [
          "You have the right to: learn whether your personal data is being processed; request information about it if so; learn the purpose of processing and whether it is used consistently with that purpose; know the third parties to whom it is transferred domestically or abroad; request correction if it is processed incompletely or incorrectly; request its deletion or destruction under the conditions in KVKK Art. 7; request that any correction or deletion be notified to third parties it was transferred to; object to a result that is to your detriment arising solely from automated analysis; and claim compensation for damages arising from unlawful processing.",
          "You may exercise these rights by contacting us via [APPLICATION CHANNEL/EMAIL — TBD].",
        ],
      },
    ],
  },
};
