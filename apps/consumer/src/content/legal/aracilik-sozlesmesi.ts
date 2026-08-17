/**
 * ============================================================================
 * DRAFT — NOT LEGAL ADVICE — REQUIRES A LAWYER'S REVIEW BEFORE LAUNCH
 * ============================================================================
 * This is a working draft of kurtar's merchant intermediation agreement
 * ("Aracılık Sözleşmesi"), written by an engineering task (task-13) to be
 * grounded in what the platform's backend actually implements — not a
 * generic template. Every commercial figure and mechanism named below is
 * cross-checked against real code as of this writing:
 *   - Fixed ₺25.00 + 20% VAT platform fee per sold bag, 5900 kuruş price
 *     floor: backend/prisma/migrations/20260814193000_settlements_
 *     membership_pricing/migration.sql (seeded PlatformPricing row),
 *     backend/src/modules/offers/offer.constants.ts.
 *   - Annual membership ₺1,990.00 + 20% VAT, offset from earnings, never
 *     charged upfront: same migration; backend/src/modules/memberships/
 *     membership-offset.service.ts.
 *   - Founding-member terms (first 100, ₺0 first-year membership, ₺19.00 +
 *     VAT locked bag fee): Merchant.bagFeeCentsOverride /
 *     membershipExemptUntil (same migration's doc comment) — a real,
 *     supported override mechanism, though the "first 100" cap itself is
 *     a commercial policy an admin applies by hand, not something the
 *     database enforces automatically.
 *   - Payout within 5 business days: backend/src/modules/settlements/
 *     business-days.ts + settlements.service.ts.
 *   - 1% withholding tax on the merchant's net earning per line:
 *     backend/src/modules/settlements/settlement-math.ts.
 *   - 15-day complaint resolution SLA, 48-hour content takedown SLA:
 *     backend/src/modules/complaints/complaint-sla-cron.service.ts,
 *     backend/src/modules/moderation/takedown-date-math.ts.
 *   - STT (son tüketim tarihi) attestation + this agreement's own version
 *     string, both accepted at merchant submission time: backend/src/
 *     modules/merchants/dto/merchant-submit.dto.ts, merchants.service.ts.
 *
 * What is NOT yet resolved and MUST be filled in / verified by counsel
 * before this is published as a binding contract:
 *   - The contracting legal entity's exact unvan, MERSİS number, tax ID,
 *     KEP address, and registered office (docs/plans/2026-08-12-kurtar-
 *     master-plan.md §5.6 — a new A.Ş. was proposed but, as of this
 *     writing, not yet incorporated).
 *   - The PSP's (iyzico/PayTR) exact split/blokaj mechanics and how they
 *     interact with the joint-liability-for-refunds clause below —
 *     Article 8 states the policy in plain terms; counsel should verify
 *     the PSP contract's own liability allocation matches it exactly.
 *   - Dispute resolution venue/jurisdiction, governing law boilerplate,
 *     force majeure, and any ETAHS-mandated minimum-content clauses this
 *     draft may have missed (Elektronik Ticaretin Düzenlenmesi Hakkında
 *     Kanun's implementing regulation sets a minimum content list for
 *     aracılık sözleşmeleri — this draft was written from the master
 *     plan's own summary of that list, not the regulation text itself).
 *   - The inflation-indexation clause (Article 11) — the master plan
 *     proposes an annual TÜFE-based adjustment mechanism; the exact
 *     formula and notice period here are a first draft, not final. It is
 *     also not yet decided whether a second indexation within one year
 *     is reserved for a high-inflation scenario.
 *   - Article 6 (Founding Member terms) — whether the locked per-bag fee
 *     runs indefinitely or only until a cutoff date (the business plan
 *     proposes 31 December 2027) is a commercial decision, not yet made.
 *
 * See landing/content/legal/README.md for the same notice, repeated for
 * every document in this directory in one place.
 * ============================================================================
 */
import type { LegalDocument } from "./types";

export const aracilikSozlesmesi: LegalDocument = {
  slug: "aracilik-sozlesmesi",
  title: {
    tr: "Aracılık Sözleşmesi",
    en: "Intermediation Agreement",
  },
  description: {
    tr: "kurtar ile işletme arasındaki aracılık ilişkisinin şartları: paket ücreti, yıllık üyelik, ödeme süresi, sorumluluklar.",
    en: "The terms of the intermediation relationship between kurtar and a business: bag fees, annual membership, payout timing, and responsibilities.",
  },
  versionLabel: {
    tr: "v0.1 — 15 Ağustos 2026",
    en: "v0.1 — 15 August 2026",
  },
  intro: {
    tr: [
      "İşbu Aracılık Sözleşmesi (\"Sözleşme\"), bir tarafta [ŞİRKET UNVANI] (\"kurtar\" veya \"Platform\") ile diğer tarafta kurtar mobil uygulaması ve/veya işletme panelinden onaylanan işletme (\"İşletme\") arasında, İşletme'nin gün sonunda satılamayan taze gıda ürünlerini \"sürpriz paket\" olarak tüketicilere aracılık hizmeti kapsamında sunulmasına ilişkin şartları düzenler.",
      "İşletme, işbu Sözleşme'yi işletme panelinde elektronik ortamda onaylayarak kabul eder; onay anı ve kabul edilen sözleşme sürüm numarası Platform tarafından kayıt altına alınır.",
    ],
    en: [
      "This Intermediation Agreement (\"Agreement\") governs the relationship between [LEGAL ENTITY NAME] (\"kurtar\" or the \"Platform\") and the business approved through the kurtar mobile application and/or business panel (the \"Business\"), under which the Business's unsold fresh food surplus is offered to consumers as a \"surprise bag\" through the Platform's intermediation service.",
      "The Business accepts this Agreement electronically through the business panel; the moment of acceptance and the accepted agreement version number are recorded by the Platform.",
    ],
  },
  blocks: {
    tr: [
      {
        heading: "Madde 1 — Taraflar ve Tanımlar",
        paragraphs: [
          "\"Platform\": kurtar mobil uygulaması, web sitesi ve işletme panelinin işletmecisi.",
          "\"İşletme\": Platform üzerinden sürpriz paket sunmak üzere başvurusu onaylanmış, vergi kimlik numarası doğrulanmış gerçek veya tüzel kişi.",
          "\"Sürpriz Paket\": İşletmenin gün içinde ürettiği veya stokladığı, gün sonuna kadar satılamayan taze gıda fazlasından oluşan, tam içeriği önceden belirtilmeyen, kategori ve tahmini değer bandı ile tanımlanan satış birimi.",
          "\"Teslim Penceresi\": Sürpriz Paket'in tüketici tarafından işletmeden teslim alınabileceği, İşletme tarafından belirlenen saat aralığı.",
        ],
      },
      {
        heading: "Madde 2 — Aracılık İlişkisinin Niteliği",
        paragraphs: [
          "Platform, İşletme ile tüketici arasındaki satış ilişkisinde yalnızca aracı hizmet sağlayıcı sıfatıyla hareket eder; Sürpriz Paket'in satıcısı İşletme'dir. Tüketiciye verilecek fiş veya faturayı düzenleme yükümlülüğü İşletme'ye aittir.",
          "Platform, İşletme adına tahsilat yapar ve işbu Sözleşme'de belirtilen esaslara göre İşletme'ye ödeme (hakediş) aktarır.",
        ],
      },
      {
        heading: "Madde 3 — İşletme'nin Taahhütleri",
        paragraphs: [
          "İşletme, son tüketim tarihi geçmiş hiçbir ürünü Sürpriz Paket içeriğine dahil etmeyeceğini kabul ve taahhüt eder (\"STT Taahhüdü\"). Bu taahhüdün ihlali, İşletme'nin Platform'dan askıya alınması veya sözleşmenin feshi için haklı sebep oluşturur.",
          "İşletme, her Sürpriz Paket şablonu için değer bandı, kategori ve alerjen uyarı metnini eksiksiz ve doğru şekilde girer. Alerjen uyarı metninin doğruluğundan ve güncelliğinden İşletme sorumludur.",
          "İşletme, yayınladığı her Sürpriz Paket için belirlediği Teslim Penceresi'nde ürünü teslime hazır bulundurur.",
          "İşletme, Gıda İşletmesi Karekodu dahil, faaliyeti için gerekli tüm gıda güvenliği izin ve belgelerine sahip olduğunu beyan eder.",
        ],
      },
      {
        heading: "Madde 4 — Platform Ücreti",
        paragraphs: [
          "Platform, satılan ve teslim edilen her Sürpriz Paket için sabit bir platform ücreti tahsil eder. İşbu Sözleşme'nin akdi tarihi itibarıyla geçerli standart ücret, paket başına 25,00 TL + %20 KDV (toplam 30,00 TL)'dir. Bu ücret, satış fiyatının bir yüzdesi olarak değil, sabit bir tutar olarak uygulanır.",
          "Yayınlanan ancak satılmayan bir Sürpriz Paket için İşletme'den herhangi bir ücret tahsil edilmez.",
          "Madde 6'da tanımlanan Kurucu Üye şartlarına hak kazanan İşletmeler için, kurucu üyelik süresince paket başı ücret 19,00 TL + %20 KDV olarak uygulanır.",
        ],
      },
      {
        heading: "Madde 5 — Yıllık Üyelik Ücreti",
        paragraphs: [
          "İşletme, Platform'u kullanabilmek için yıllık 1.990,00 TL + %20 KDV tutarında bir üyelik ücretine tabidir.",
          "Üyelik ücreti İşletme'den peşin tahsil edilmez. Bunun yerine, İşletme'nin Sürpriz Paket satışlarından elde ettiği hakedişten, hakediş tutarı yeterli olduğu ölçüde otomatik olarak mahsup edilir. İşletme'nin hiç satışı olmadığı bir dönemde üyelik ücretinden dolayı hiçbir borç talep edilmez veya işletilmez.",
          "Üyelik dönemi, İşletme'nin Platform tarafından onaylandığı tarihten itibaren bir yıl olarak işler ve takip eden yıllarda aynı tarihte yenilenir.",
        ],
      },
      {
        heading: "Madde 6 — Kurucu Üye Şartları",
        paragraphs: [
          "Platform'a ilk 100 (yüz) İşletme arasında onaylanan işletmeler, aşağıdaki avantajlardan yararlanır: (a) ilk üyelik dönemi için 0 TL üyelik ücreti, (b) 19,00 TL + %20 KDV olarak kilitlenen paket başı platform ücreti.",
          "Kurucu Üye şartlarının uygulanma sırası, İşletme'nin Platform'a onaylanma tarihine göre belirlenir; kontenjan dolduğunda yeni başvurular standart şartlara tabi olur.",
        ],
      },
      {
        heading: "Madde 7 — Ödeme (Hakediş) ve Süresi",
        paragraphs: [
          "Platform, satılan ve teslim edilen her Sürpriz Paket için İşletme'ye ödenecek net hakedişi; brüt satış tutarından platform ücreti, platform ücretine ait KDV, yasal stopaj kesintisi ve varsa mahsup edilen üyelik bakiyesi düşülerek hesaplar.",
          "Hesaplanan net hakediş, Sürpriz Paket'in tüketiciye teslim edildiği tarihten itibaren en geç 5 (beş) iş günü içinde İşletme'nin bildirdiği IBAN'a aktarılır. Bu süre, Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve ilgili mevzuat kapsamında Platform'un yasal yükümlülüğüdür; sözleşmesel bir tercih değildir.",
          "Ödemelerden, aracı hizmet sağlayıcılar üzerinden yapılan ödemelere ilişkin yürürlükteki mevzuat uyarınca %1 oranında gelir vergisi stopajı kesilir ve İşletme adına ilgili vergi dairesine beyan edilir.",
        ],
      },
      {
        heading: "Madde 8 — İadeler ve Müteselsil Sorumluluk",
        paragraphs: [
          "Tüketicinin Teslim Penceresi başlamadan en geç 2 (iki) saat önce yaptığı iptallerde, ödenen tutar tüketiciye tam olarak iade edilir.",
          "Bir Sürpriz Paket'e ait hakediş henüz İşletme'ye aktarılmamışsa, tüketiciye yapılacak iadeden Platform ve İşletme müteselsilen sorumludur. Hakediş İşletme'ye aktarıldıktan sonra doğan iade yükümlülükleri, takip eden hakediş döneminde İşletme'nin bakiyesinden mahsup edilir (\"iade kesintisi\").",
          "İşletme'nin kendi inisiyatifiyle bir Sürpriz Paket'i iptal etmesi halinde, ilgili rezervasyonlara ait tüm tutarlar tüketiciye tam olarak iade edilir; bu iadeden kaynaklanan maliyet İşletme'ye yansıtılabilir.",
        ],
      },
      {
        heading: "Madde 9 — Şikayet Yönetimi ve İçerik Kaldırma",
        paragraphs: [
          "İşletme hakkında Platform üzerinden iletilen tüketici şikayetleri, ilgili mevzuat kapsamında en geç 15 (on beş) gün içinde sonuçlandırılır. İşletme, kendisine iletilen şikayetlere makul sürede yanıt vermekle yükümlüdür.",
          "Mevzuata veya işbu Sözleşme'ye aykırılık teşkil ettiği bildirilen bir İşletme içeriği (paket ilanı, mağaza profili, değerlendirme), bildirimden itibaren en geç 48 (kırk sekiz) saat içinde incelenir ve gerekiyorsa yayından kaldırılır.",
        ],
      },
      {
        heading: "Madde 10 — Askıya Alma ve Fesih",
        paragraphs: [
          "Platform, STT Taahhüdü'nün ihlali, gıda güvenliği ihlali şüphesi, tekrarlanan tüketici şikayetleri veya işbu Sözleşme'nin esaslı ihlali hallerinde İşletme hesabını askıya alabilir; askıya alma anında İşletme'nin yayında olan tüm Sürpriz Paketleri iptal edilir ve ilgili tüketicilere tam iade yapılır.",
          "Taraflardan her biri, [BİLDİRİM SÜRESİ TBD] önceden yazılı bildirimde bulunmak kaydıyla işbu Sözleşme'yi herhangi bir zamanda feshedebilir. Fesih, fesih tarihinden önce doğmuş hakediş ve iade yükümlülüklerini ortadan kaldırmaz.",
        ],
      },
      {
        heading: "Madde 11 — Ücret Güncellemesi (Endeksleme)",
        paragraphs: [
          "Platform, paket başı ücret ve yıllık üyelik ücretini, her yıl 1 Ocak tarihi itibarıyla bir önceki yıla ait TÜFE oranına göre güncelleyebilir; güncellenen tutarlar en yakın 5 TL'ye yuvarlanır ve yürürlüğe girmeden en az 30 gün önce İşletme'ye bildirilir.",
          "Kurucu Üye şartlarıyla kilitlenen paket ücreti, bu maddede tanımlanan genel endeksleme mekanizmasının dışındadır.",
        ],
      },
      {
        heading: "Madde 12 — Yürürlük",
        paragraphs: [
          "İşbu Sözleşme, İşletme'nin işletme panelinden elektronik onay verdiği tarihte yürürlüğe girer ve taraflardan biri tarafından feshedilene kadar yürürlükte kalır.",
        ],
      },
    ],
    en: [
      {
        heading: "Article 1 — Parties and Definitions",
        paragraphs: [
          "\"Platform\": the operator of the kurtar mobile application, website, and business panel.",
          "\"Business\": a natural or legal person whose application to offer surprise bags through the Platform has been approved, with a verified tax ID.",
          "\"Surprise Bag\": a sales unit made up of the Business's fresh food surplus, produced or stocked during the day and unsold by closing, whose exact contents are not disclosed in advance and which is instead described by category and an estimated value band.",
          "\"Pickup Window\": the time range, set by the Business, during which a consumer may collect a Surprise Bag from the Business.",
        ],
      },
      {
        heading: "Article 2 — Nature of the Intermediation Relationship",
        paragraphs: [
          "The Platform acts solely as an intermediary service provider in the sales relationship between the Business and the consumer; the seller of a Surprise Bag is the Business. The obligation to issue a receipt or invoice to the consumer belongs to the Business.",
          "The Platform collects payment on the Business's behalf and remits payment (the payout) to the Business according to the terms set out in this Agreement.",
        ],
      },
      {
        heading: "Article 3 — Business Commitments",
        paragraphs: [
          "The Business represents and commits that it will never include any product past its use-by date in a Surprise Bag's contents (the \"STT Commitment\"). A breach of this commitment constitutes just cause for suspension or termination of the Business's account.",
          "The Business enters a complete and accurate value band, category, and allergen warning text for every Surprise Bag template it creates. The Business is responsible for the accuracy and currency of the allergen warning text.",
          "The Business keeps each published Surprise Bag ready for handover during the Pickup Window it has set.",
          "The Business represents that it holds all food safety permits and documentation required for its activity, including the Food Business QR Code (Gıda İşletmesi Karekodu).",
        ],
      },
      {
        heading: "Article 4 — Platform Fee",
        paragraphs: [
          "The Platform charges a fixed platform fee for every Surprise Bag that sells and is picked up. As of the date this Agreement is executed, the standard fee is ₺25.00 + 20% VAT per bag (₺30.00 total). This fee applies as a fixed amount, never as a percentage of the sale price.",
          "No fee is charged to the Business for a published Surprise Bag that does not sell.",
          "For Businesses qualifying for the Founding Member terms defined in Article 6, the per-bag fee is ₺19.00 + 20% VAT for the duration of that status.",
        ],
      },
      {
        heading: "Article 5 — Annual Membership Fee",
        paragraphs: [
          "The Business is subject to an annual membership fee of ₺1,990.00 + 20% VAT to use the Platform.",
          "The membership fee is never collected upfront from the Business. Instead, it is automatically offset from the Business's earnings on Surprise Bag sales, to the extent those earnings are sufficient. During any period in which the Business has made no sales, no membership debt is claimed or accrued.",
          "The membership period runs for one year from the date the Business is approved by the Platform, and renews on the same date each following year.",
        ],
      },
      {
        heading: "Article 6 — Founding Member Terms",
        paragraphs: [
          "Businesses approved among the first 100 (one hundred) on the Platform receive: (a) a ₺0 membership fee for their first membership period, and (b) a per-bag platform fee locked at ₺19.00 + 20% VAT.",
          "The order in which Founding Member terms apply is determined by the Business's approval date on the Platform; once the quota is filled, new applications are subject to standard terms.",
        ],
      },
      {
        heading: "Article 7 — Payout and Its Timing",
        paragraphs: [
          "The Platform calculates the net payout owed to the Business for each sold and picked-up Surprise Bag by deducting the platform fee, VAT on that fee, mandatory withholding tax, and any offset membership balance from the gross sale amount.",
          "The calculated net payout is transferred to the Business's declared IBAN within 5 (five) business days, at the latest, of the Surprise Bag being delivered to the consumer. This period is the Platform's legal obligation under the Law on the Regulation of Electronic Commerce and related legislation — not a contractual preference.",
          "A 1% income tax withholding is deducted from payouts under legislation currently in effect governing payments made through intermediary service providers, and is declared to the relevant tax office on the Business's behalf.",
        ],
      },
      {
        heading: "Article 8 — Refunds and Joint Liability",
        paragraphs: [
          "For a consumer cancellation made no later than 2 (two) hours before the Pickup Window begins, the amount paid is refunded to the consumer in full.",
          "If the payout for a Surprise Bag has not yet been transferred to the Business, the Platform and the Business are jointly and severally liable for any refund owed to the consumer. A refund obligation arising after the payout has already been transferred to the Business is offset (\"refund clawback\") against the Business's balance in the following payout period.",
          "Where the Business cancels a Surprise Bag on its own initiative, all amounts for the affected reservations are refunded to the consumer in full; the cost of that refund may be passed on to the Business.",
        ],
      },
      {
        heading: "Article 9 — Complaint Handling and Content Takedown",
        paragraphs: [
          "Consumer complaints submitted about a Business through the Platform are resolved within 15 (fifteen) days, at the latest, under applicable legislation. The Business is obligated to respond to complaints directed to it within a reasonable time.",
          "Business content (a bag listing, store profile, or rating) reported as violating legislation or this Agreement is reviewed, and removed if warranted, within 48 (forty-eight) hours, at the latest, of the report.",
        ],
      },
      {
        heading: "Article 10 — Suspension and Termination",
        paragraphs: [
          "The Platform may suspend a Business's account for breach of the STT Commitment, suspected food safety violations, repeated consumer complaints, or a material breach of this Agreement; upon suspension, all of the Business's live Surprise Bags are cancelled and affected consumers are refunded in full.",
          "Either party may terminate this Agreement at any time upon [NOTICE PERIOD TBD] prior written notice. Termination does not extinguish payout or refund obligations that arose before the termination date.",
        ],
      },
      {
        heading: "Article 11 — Fee Updates (Indexation)",
        paragraphs: [
          "The Platform may update the per-bag fee and the annual membership fee, effective each 1 January, in line with the prior year's CPI (TÜFE) rate; updated amounts are rounded to the nearest ₺5 and notified to the Business at least 30 days before taking effect.",
          "A per-bag fee locked under Founding Member terms is outside the general indexation mechanism defined in this Article.",
        ],
      },
      {
        heading: "Article 12 — Effective Date",
        paragraphs: [
          "This Agreement takes effect on the date the Business gives electronic acceptance through the business panel, and remains in effect until terminated by either party.",
        ],
      },
    ],
  },
};
