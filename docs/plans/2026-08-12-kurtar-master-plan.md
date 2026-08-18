# TGTG-Türkiye ("kurtar" kod adı) — Baştan Aşağıya Kuruluş ve Uygulama Planı

> Durum: TAMAM — 6-ajanlı pazar araştırması + kds yeniden-kullanım envanteri + 2 Plan ajanı (teknik mimari, iş/GTM/hukuk) sentezlendi. Onay bekliyor.

## 1. Bağlam (neden bu proje, neden şimdi)

Kurucu (tarik), HummyTummy restoran SaaS'ının sahibi. Hedef: Too Good To Go modelini (gün sonu artık gıdanın "sürpriz paket" olarak ~1/3 fiyatına ön-satışı, müşteri gel-al) Türkiye'de **bağımsız yeni bir ürün** olarak hayata geçirmek. HummyTummy'den ayrı proje; ileride entegrasyon (restoranların POS'undan tek tıkla paket yayınlama) ayrı bir faz.

**Doğrulanmış pazar boşluğu (Ağu 2026, 6-ajanlı web araştırması):**
- TGTG Türkiye'de yok (resmi ülke listesi teyitli). Tek yerli muadil Fazla'nın B2C uygulaması fiilen ölü (2.28/5, son güncelleme Oca 2025, "sipariş verilemiyor" yorumları; şirket B2B'ye döndü). Klon girişim SonPaket pre-launch (0 paket / 0 partner placeholder, mağaza linkleri boş). **Türkiye'de bugün çalışan bir sürpriz-paket uygulaması yok; pencere açık ama SonPaket yolda.**
- Talep sinyalleri: TÜİK 2025 israf verisi (meyve-sebze %39.7, ekmek %32.5); Migros SKT-indirim programı tek yılda 32 Jet mağazası cirosuna eş tasarruf; ~%33 enflasyonda indirim avcılığı kültürü.
- Model hukuken **yasal ve emsalli** (Fazla yıllarca çalıştı). STT geçmiş gıda satışı kesinlikle yasak (modelde zaten yok — gün sonu TAZE fazla satılır).
- TGTG birim ekonomisi (referans): ABD $1.79/paket + $89/yıl; AB ~€1.09/paket + yıllık ücret; paket, içerik değerinin ~1/3'üne satılır; ana şirket 2024: 725M DKK ciro, kârlı; ResQ Club alternatifi %25 komisyon.

## 2. Kilitlenen kararlar (kullanıcı onaylı)

| Karar | Seçim |
|---|---|
| Konum | HummyTummy'den tamamen ayrı, standalone ürün/girişim; entegrasyon sonra |
| Gelir modeli | TGTG-usulü: **sabit ₺/paket + yıllık işletme üyeliği** (₺ tutarları iş planında önerilecek; enflasyona karşı yıllık endeksleme mekanizmalı) |
| Coğrafya | **İstanbul-önce saha satışı + ulusal self-serve** kayıt (gel-al modeli kuryesiz → teknik olarak ulusal açık) |
| MVP genişliği | **Tam TGTG paritesi** (harita+liste keşif, arama/filtre, favoriler, satın alma, iptal pencereleri, gel-al penceresi + personel önünde swipe-to-redeem, puanlama, push bildirim, etki sayaçları (CO₂/öğün), işletme self-signup+onboarding, günlük paket yönetimi, hakediş ekstreleri, admin panel) |
| Stack (teknik karar, kullanıcı yetkilendirdi) | Tüketici: **Expo/React Native** (iOS+Android, OTA). Backend: **NestJS + Prisma + PostgreSQL + Redis** (kds kalıpları taşınır). İşletme+admin panelleri: React (Vite) web. Landing: Next.js (kds landing kalıbı, 5-dil). Deploy: kds-marketing emsali (aynı VPS'te kendi port bloğu + kendi Postgres, tag-driven CI). |

## 3. Düzenleyici çerçeve (mimarinin kodlaması gereken kurallar — doğrulanmış)

- **Ödeme (6493):** tüketiciden para toplamak = ödeme hizmeti → **lisanslı PSP'nin pazaryeri ürünü** şart (iyzico Pazaryeri belgeli: alt üye işyeri + split + blokaj; PayTR muadili doğrulanacak). Kendi lisansımız gereksiz.
- **ETAHS (6563):** lansman öncesi **ETBİS kaydı + KEP**; işletme kimlik doğrulama (vergi no, yıllık teyit); uygulama içi şikayet sistemi (**15 günde çözüm**); 48 saatte içerik kaldırma; zorunlu asgari içerikli aracılık sözleşmesi; kendi markalı mal satma yasağı.
- **Settlement:** işletmeye ödeme, tahsilat+teslimden itibaren **en geç 5 iş günü**; ödemelerden **%1 stopaj** kesintisi (2025'ten beri zorunlu).
- **Fiş/fatura:** tüketici fişini **işletme** keser (ÖKC/e-Arşiv); platform işletmeye **komisyon e-Faturası** keser; platformun kendisi ~3 ay içinde e-Fatura mükellefi olmak zorunda (ciro şartı yok).
- **Tüketici hukuku:** bozulabilir gıdada **cayma hakkı yok**; para işletmeye geçene dek iadelerden platform **müteselsilen sorumlu**; sürpriz paketin "içeriği bilinmiyor" doğası için özenli ön-bilgilendirme metni (kategori + değer bandı + **alerjen uyarısı**).
- **Gıda güvenliği:** STT geçmiş satış yasak (işletme taahhüdü + ihbar mekanizması); TETT'li kuru gıda online'da riskli → MVP dışı; Gıda İşletmesi Karekodu (Mayıs 2025 zorunluluğu) uygulamada güven rozeti olarak gösterilebilir.

## 4. Teknik mimari (Plan ajanı çıktısı — kds yolları doğrulanmış)

### 4.0 Repo yapısı
Yeni bağımsız repo **`kurtar`** (kod adı), npm workspaces, kds-marketing emsali:
```
kurtar/
├── backend/            # NestJS 10 + Prisma + PostgreSQL(PostGIS) + Redis
├── apps/consumer/      # Expo (RN, TypeScript, expo-router)
├── apps/merchant-web/  # React+Vite işletme paneli (mobil-öncelikli responsive)
├── apps/admin-web/     # React+Vite operasyon paneli
├── landing/            # Next.js (next-intl, kds landing deseni)
├── ops/                # compose (lokal/staging/prod) + monitoring scrape ekleri
├── scripts/            # db-migration-doctor.sh, backup, i18n-parity (kds kopyaları)
└── .github/workflows/  # quality-gates.yml, release-deploy.yml, mobile-build.yml
```
- İmajlar: `ghcr.io/<org>/kurtar-{api,merchant,admin,landing}`. Tag aileleri: `v*` (backend+web), `consumer-v*` (EAS Build), `ota-v*` (EAS Update) — mobil sürümleme backend'den ayrık.
- İlk gün: Expo-monorepo Metro reçetesi (`watchFolders` + `nodeModulesPaths`).

### 4.1 Veri modeli (Prisma taslağı — para hep kuruş Int, UTC)
- **Kimlik:** `User` (phoneE164 unique, OTP ile), `PhoneOtp` (hash+TTL+cooldown+lockout — kds `phone-verification.service.ts` birebir), `RefreshToken` (rotation+reuse-detection), `PushToken` (Expo), `NotificationPreference` (favori/yakın/yarıçap/sessiz saat).
- **İşletme:** `Merchant` (VKN/MERSİS, IBAN, `verificationStatus` durum makinesi DRAFT→…→APPROVED, yıllık `nextReverifyAt` — ETAHS, `pspSubMerchantKey`, gıda-denetim karekod URL, STT taahhüt + aracılık sözleşme versiyonu/kabul zamanı), `MerchantUser`, `MerchantVerificationEvent` (audit), `MembershipSubscription` (yıllık, anchor — kds `licensing/anniversary.ts` invariantları).
- **Mağaza/teklif:** `Store` (geography(Point,4326) + GIST), `BagTemplate` (kategori, diyet bayrakları, **alerjen uyarı metni zorunlu**, değer bandı min/max, fiyat), `DailyOffer` (offerDate, qtyTotal/Reserved/Redeemed, pickup penceresi, durum: DRAFT→SCHEDULED→PUBLISHED⇄SOLD_OUT→CLOSED, CANCELLED her durumdan; `@@unique([bagTemplateId, offerDate])`).
- **Sipariş/ödeme:** `Reservation` (kısa kod "K-7F3A", cancelDeadline=pickupStart−2s, durumlar: PENDING_PAYMENT|CONFIRMED|REDEEMED|CANCELLED_*|NO_SHOW|EXPIRED), `Payment` (merchantOid "KRV-" prefix — kds webhook prefix-routing deseni, idempotencyKey), `Refund`, `WebhookEventLog` (idempotent settle).
- **Mutabakat/fatura:** `SettlementBatch` (brüt − paket ücreti − %1 stopaj − üyelik mahsubu − iade clawback = net; `dueAt` ≤5 iş günü — resmi tatil tablosuyla), `SettlementLine`, `CommissionInvoice` (Nilvera, EFATURA/EARSIVFATURA yönlendirmeli).
- **Sosyal/uyum:** `Rating` (yalnız REDEEMED sonrası), `Favorite`, `ImpactLedger` (öğün/CO₂e/tasarruf), `ComplaintTicket` (**15 gün SLA** — ETAHS), `ContentReport` (**48 saat takedown**), `OutboxEvent` (kds şeması), `AuditLog`.

### 4.2 NestJS modül haritası (kds borçlanma matrisi)
`auth`+`otp`+`sms` (kds taşıma) · `merchants` (KYC durum makinesi, yıllık re-verify cron) · `stores`/`offers` (publish→outbox) · `discovery` (PostGIS+Redis cache) · `reservations` (atomik stok, sweeper — kds self-pay-* üçlüsü) · `payments-core` (registry/facade/mock birebir) · `payments/iyzico` (yeni adapter, saf-imza-builder stili) · `payments/webhooks` (IP allowlist+hash+idempotent settle) · `settlements` (batch+stopaj+5-iş-günü+reconciliation) · `memberships` (kds licensing) · `invoicing` (Nilvera+UBL-TR) · `notifications` (Expo Push yeni; BullMQ fan-out; email hbs) · `outbox` (komple taşıma; ileride HummyTummy HMAC relay) · `ratings`/`favorites`/`impact` · `complaints` (SLA) · `admin`.

Ana outbox akışları: `offer.published.v1`→push fan-out (favoriler + yarıçap içi), `reservation.confirmed.v1`→merchant canlı sayaç, `reservation.redeemed.v1`→SettlementLine+impact+rating daveti, `offer.cancelled.v1`→toplu iade+push, `settlement.batch.sent.v1`→komisyon e-Faturası, `complaint.opened.v1`→SLA saati.

### 4.3 Ödeme & mutabakat — karar: **iyzico Pazaryeri (split+blokaj), collect-then-payout DEĞİL**
Gerekçe: kendi hesabında para toplamak = 6493 lisanssız ödeme hizmeti. iyzico split+blokaj üç zorunluluğu birden karşılar: para PSP'de durur; blokaj müteselsil iade sorumluluğunun doğal teminatı; 5-iş-günü kuralı transfer zamanlamasıyla programlanır. PayTR platform-transfer, registry seam'i sayesinde yedek ikinci adapter.
- **Satın alma:** `$transaction` içinde atomik stok (`UPDATE ... WHERE qtyReserved+qty<=qtyTotal`, 0 satır=SOLD_OUT) → iyzico init (subMerchantPrice = brüt − paket ücreti − %1 stopaj; **stopaj platform payında toplanır, muhtasarla ödenir**) → webhook: imza+IP+idempotency+tutar mutabakatı (sapma⇒alarm, settle etme) → sweeper: 10dk yaşlı PENDING_PAYMENT'ı PSP'den sorgula, ödenmemişse EXPIRED+stok iade.
- **İptal/iade:** kullanıcı iptali cancelDeadline öncesi serbest; sonrası yok (bozulabilir gıda — cayma istisnası, ön-bilgilendirmede açık). İşletme iptali → otomatik tam iade fan-out + skor. No-show: iade yok, normal satış sayılır (TGTG paritesi). İade kaynağı: payout gönderilmemişse blokajdan, gönderildiyse sonraki batch clawback.
- **Payout:** gecelik batch, iş-günü takvimli `dueAt` ≤5 iş günü; iyzico onay/transfer → SENT → PSP mutabakatıyla SETTLED; ardından Nilvera komisyon e-Faturası (paket ücreti + üyelik kalemleri; stopaj fatura kalemi değil, dekont satırı). Reconciliation sweeper: 3 gün SETTLED olmayan SENT batch'ler ⇒ rapor.

### 4.4 Tüketici uygulaması (Expo)
- expo-router: (auth) telefon→OTP→izinler; (tabs) Keşfet (liste⇄harita, filtre sheet), Ara, Favoriler ("bugün paketi var" rozeti), Siparişler (geri sayım + swipe-to-redeem), Profil (etki istatistikleri, tercihler, yasal, şikayet). Modallar: OfferDetail (değer bandı+alerjen+denetim karekodu), Checkout (iyzico WebView), RedeemScreen, StoreProfile, RatingSheet.
- TanStack Query (`['offers', geohash5, filtreHash]`, staleTime 30sn, AsyncStorage persist); harita `react-native-maps` (Mapbox'a gerek yok) + supercluster; push **Expo Notifications** (greenfield; FCM+APNs EAS'te); deep link `kurtar://` + universal link; OTA EAS Update.
- Store checklist: Apple **fiziksel mal → IAP DEĞİL** (Guideline 3.1.3(e), harici ödeme serbest — review notuna yaz), D-U-N-S Wave 0'da, demo hesap+video, KVKK/veri-güvenliği formları.

### 4.5 Keşif/geo — karar: **PostGIS 1. günden** (`postgis/postgis:16-3.4`)
Tek query-plan'da "ST_DWithin yarıçap + kategori + diyet + saat + stok + mesafe sıralı + sayfalı"; GIST index + `PUBLISHED` kısmi index. Harita pin'leri bbox varyantı. Redis **sonuç cache'i** (`disc:{geohash5}:{filtreHash}`, TTL 45sn) — drop saatinde aynı hücre tek DB sorgusuna iner; kesin doğruluk satın-alma UPDATE'inde.

### 4.6 Swipe-to-redeem (donanımsız teslim)
Müşteri ekranında canlı saat + kod; **personel önünde swipe** → server-side pencere kontrolü → yeşil tam-ekran. Offline tolerans: yerel işaretle + retry kuyruğu + turuncu "çevrimdışı onaylandı" ekranı; panel teslim listesiyle çapraz kontrol (idempotent). No-show iadesizliği offline-redeem'in finansal riskini sıfırlar.

### 4.7 Admin panel
İşletme onay kuyruğu (VKN doğrulama — kds `isValidTaxId`), yıllık re-verify listesi, moderasyon + 48s takedown sayacı, manuel iade/batch bekletme/PSP uyuşmazlık ekranı, 15-gün şikayet SLA panosu, push kampanya, kill-switch (işletme askıya al → aktif offer'lar CANCELLED + iade fan-out).

### 4.8 Landing/SEO
Next.js + next-intl (MVP tr+en, 5-locale iskelet hazır); işletme kayıt hunisi `/isletme`; programatik şehir/kategori sayfaları (`/istanbul/firin`); smart banner + `/o/:id` universal-link köprüsü; canlı impact sayacı.

### 4.9 CI/CD + ortamlar
Paylaşımlı VPS (adres deploy secret'ında), kendi compose/ağ/volume; **port bloğu prod 4750-59, staging 4760-69**; kendi PostGIS + Redis; gecelik backup + offsite. CI: quality-gates deseni (gerçek PostGIS'te `db push` e2e, i18n parity). CD: `v*` tag → preflight (migration doctor + `ss -ltn` port çakışması) → GHCR → compose; blue/green script'i. Monitoring: mevcut kds Prometheus/Grafana/Loki stack'ine scrape target ekle. Migration'lar: elle yazılmış **up/down** SQL (kds konvansiyonu + global kural).

### 4.10 İnşa sırası (1 senior + AI hızı)
- **Wave 0 (evrak, 0. gün başlar, 4-8 hafta bekleme):** ETBİS+KEP, **iyzico Pazaryeri başvurusu (kritik yol #1)**, Apple D-U-N-S (**kritik yol #2**), e-Fatura mükellefiyeti, sözleşme metinleri (hukukçu).
- **Wave 1 (çekirdek döngü, 6-8 hafta):** bootstrap+CI+PostGIS → auth/OTP/SMS → merchant onboarding (manuel onay) + offer publish → discovery → rezervasyon+iyzico+webhook+sweeper → swipe-to-redeem → temel push → merchant "Bugün" ekranı → admin minimal. *Çıkış: İstanbul'da 10 pilot mağazayla gerçek para.*
- **Wave 2 (parite, 4-6 hafta):** iade/no-show tam akış → settlement+stopaj+Nilvera → üyelik → favori/rating/impact → şikayet+takedown → bildirim tercihleri → en locale → store submission (Apple ~1-2 hafta tampon).
- **Wave 3 (cila/ölçek, 3-4 hafta):** load-hardening, discovery cache, OTA pipeline, panolar, ETAHS raporları, programatik SEO, yıllık re-verify otomasyonu, **HummyTummy outbox relay köprüsü** (restoranlara "kurtar'da paket sat" çapraz satışı).

### 4.11 Test stratejisi
Para yolu = **realdb spec** (paralel 50 istek × qty 5 ⇒ tam 5 CONFIRMED oversell testi; webhook ×3 ⇒ tek settle; tutar sapması ⇒ settle yok; batch matematiği kuruş invariantları; iş-günü takvimi tatil fikstürü). CI: gerçek PostGIS + mock PSP e2e + webhook imza golden testleri. **Drop-saati thundering herd tasarımı:** publish jitter 0-120sn, BullMQ rate-limited push fan-out, satın almada kuyruk YOK (atomik UPDATE yeterli; Redis sayaç yalnız load test kanıtlarsa), k6 nightly (20k eşzamanlı, 500 offer, hedef p95<500ms, sıfır oversell). Mobil: Maestro e2e.

### 4.12 İlk 10 teknik risk (özet)
iyzico onboarding gecikmesi (0. gün başvuru + PayTR yedek + mock ile geliştirme) · oversell (atomik UPDATE + CHECK constraint + yarış testi) · webhook kaçırma (idempotency+sweeper+mutabakat) · stopaj muhasebesi (saf util + golden fikstür + muhasebeci onayı) · 5-iş-günü ihlali (tatil tablosu + alarm) · Apple reddi (3.1.3(e) referanslı review notu) · sahte redeem (canlı saat + server pencere kontrolü) · push teslim oranı (token sağlığı + SMS fallback) · paylaşımlı VPS çekişmesi (limitler + taşınabilirlik) · ETAHS uyum boşluğu (uyum koda gömülü + lansman gate'i: ETBİS+KEP olmadan prod tag yok).

### 4.1 kds'ten taşınacak doğrulanmış varlıklar (envanter çıkarıldı)
- PayTR adaptörü: `backend/src/modules/payments/adapters/paytr.adapter.ts` (saf imza kurucular, kuruş) + webhook doğrulama (`paytr-hash.util.ts`, `paytr-ip-allowlist.guard.ts`, merchant_oid prefix yönlendirmeli controller)
- payments-core registry seam (`payment-provider.interface.ts` / registry / facade / mock)
- Tüketici-satın-alma settlement analoğu: `customer-orders/services/self-pay-*.ts` (idempotent webhook settle, tutar mutabakatı, orphan sweeper)
- Auth: `token.service.ts` (refresh rotation + reuse detection), httpOnly cookie konvansiyonu, guard/decorator seti; `@NormalizePhone` (E.164); OTP sertleştirme referansı `phone-verification.service.ts`
- SMS (NetGSM/Twilio seam), email (hbs şablonları), Socket.IO + redis adapter, **transactional outbox** + HMAC cross-service relay (ileride HummyTummy entegrasyonunun hazır deseni)
- e-belge: `accounting/adapters/nilvera.adapter.ts` + `e-document-routing.ts` (EFATURA/EARSIVFATURA yönlendirme) + UBL-TR builder → komisyon faturaları
- Geo: `common/utils/geolocation.util.ts` (Haversine), `useGeolocation.ts`
- i18n: i18next namespace-per-file (tr/en/ru/ar/uz) + parite/drift CI script'leri
- İnfra: `release-deploy.yml` (tag→preflight→GHCR→deploy), `quality-gates.yml` (gerçek-Postgres e2e), `db-migration-doctor.sh`, backup script, kds-marketing bootstrap şablonu
- Yıllık üyelik için: kds `licensing` modülü (yıl dönümü faturalama) + `entitlements` kalıbı
- **Greenfield boşluklar:** push bildirim (Expo Notifications + FCM/APNs — kds'te hiç yok), React Native, pazaryeri split/payout mantığı, (gerekirse) PostGIS

## 5. İş planı (Plan ajanı çıktısı — ₺ çıpaları Ağu 2026 web'den doğrulanmış)

### 5.1 Fiyatlama (₺, Ağu 2026; "içerik değerinin ~1/3'ü" kuralı)
Doğrulanmış çıpalar: simit ₺25 (İSTESOB), ekmek ₺17,50, pasta dilimi ~₺140-170, zincir latte ~₺150-165.

| Segment | İçerik değeri (tahmin) | Paket bandı | Standart fiyat |
|---|---|---|---|
| Fırın | 180-300 ₺ | 59-99 ₺ | **69 ₺** |
| Pastane | 400-650 ₺ | 129-219 ₺ | **149 ₺** |
| Kafe | 300-450 ₺ | 99-149 ₺ | **119 ₺** |
| Restoran | 450-700 ₺ | 149-229 ₺ | **169 ₺** |
| Manav | 250-400 ₺ | 79-129 ₺ | **99 ₺** |

- Taban paket fiyatı **59 ₺**; beklenen ortalama sepet ~115-125 ₺ (tahmin).
- **Paket başı platform ücreti: 25 ₺ + KDV (%20) = 30 ₺ kesinti.** Blended efektif ~%20-22 — TGTG US (~%30-36) ve ResQ (%25) bandının altında, sahada savunulabilir.
- **Yıllık üyelik: 1.990 ₺ (öneri)** — peşin alınmaz, ilk hakedişlerden mahsup (TGTG-usulü "kazanmadan ödemezsin").
- **Kurucu Üye kilidi (ilk 100 işletme):** ilk yıl üyelik 0 ₺ + paket ücreti 19 ₺+KDV, 31 Ara 2027'ye kadar sabit (SonPaket'e karşı arz kilidi).
- **Enflasyon endekslemesi sözleşme maddesi (lansmanda girmeli):** her 1 Ocak TÜFE oranında otomatik güncelleme (5 ₺'ye yuvarlı, 30 gün önceden bildirim); TÜFE >%40 ise yılda iki kez endeksleme hakkı saklı.

### 5.2 Birim ekonomi
Örnek (kafe, 119 ₺): tüketici 119 → PSP ~−3,50 (platform gideri) → platform ücreti −30 (KDV'li) → işletme hakedişi 89 → %1 stopaj −0,89 → **işletmeye net 88,11 ₺ (≤5 iş günü)**. Platform brüt katkısı/paket **~21,50 ₺** (KDV hariç).
Aylık başabaş (tahmini sabitler: altyapı+SMS+muhasebe+mağaza ücretleri+pazarlama; asgari ücret işveren maliyeti ~40,9k ₺ doğrulanmış):
- **Senaryo A (1 saha satışçısı, ~76k ₺/ay):** ~3.550 paket/ay ≈ **60 aktif işletme × 2 paket/gün**.
- **Senaryo B (2 satışçı, ~139k ₺/ay):** ~6.450 paket/ay ≈ **110 işletme × 2 paket/gün**.
- Üyelik mahsupları dolunca başabaş ~%15 düşer. Kurucu maaşı/ürün maliyeti 0 varsayıldı (AI-destekli tek kurucu).

### 5.3 Arz GTM (İstanbul)
- **İlçe sırası:** (1) **Kadıköy** (Moda-Caferağa-Yeldeğirmeni-Bahariye) — ilk 4 hafta SADECE burası: en yoğun bağımsız fırın/kafe dokusu + genç profesyonel, yürüyerek taranabilir → tek bölgede likidite kur; (2) Beşiktaş + Şişli/Nişantaşı; (3) Beyoğlu, Üsküdar, Ataşehir (Ara+).
- **Segment sırası:** fırın/pastane → kafe → manav → restoran (fırın önce: günlük KESİN fazla — TGTG'nin kanıtlanmış girişi). Yerel zincirler 2. ay+, ulusal 4. ay+.
- **İlk 100 işletme:** günde 15 tezgah ziyareti, %20 kapanış → ~8 hafta. 60 saniyelik saha scripti hazır (üç ayak: çöp→nakit, yeni müşteri keşfi, sıfır risk: satılmazsa ücret yok, cihaz gerekmez). İlk 2 hafta **concierge onboarding** (paketleri satışçı girer).

### 5.4 Talep GTM
Persona: 18-30 öğrenci + genç beyaz yaka. Çekirdek mekanik: TikTok/IG **"sürpriz paket açılışı"** Reels ("149 ₺ verdim, bakın ne çıktı") — TGTG'nin kanıtlanmış viral döngüsü; lansmanda 20-30 mikro-influencer'a paket kuponu. Kampüs elçileri (Marmara-Göztepe, Boğaziçi, Yıldız, İTÜ). Basın çift anlatısı: "gıda israfı × pahalılık" (TÜİK verisiyle) + first-mover açısı. Referral: iki tarafa 25 ₺. Her işletmeye QR'lı cam çıkartması (vitrin = bedava pano). CAC hedefi: ≤40 ₺/kayıt, ≤120 ₺/ilk sipariş; ilk 3 ay ücretli reklam yok. İlk 10k kullanıcı kırılımı: organik/influencer 3k, kampüs 2k, PR 2k, vitrin QR 2k, referral 1k.

### 5.5 Marka
**Öneri: "Kurtar"** (tek kelime, emir kipi CTA; kurtar.app DNS-boş görünüyor, kurtarkap.com/.com.tr yedek — satın alma öncesi WHOIS/TRABIS teyidi ŞART). Alternatifler: KurtarKap, PaketKurtar, SofraKurtar, Akşam Paketi, Ziyan Yok. Türk Patent tescili 9+35+43. sınıflar (~15,8k ₺ harç doğrulanmış + vekil). Konumlandırma: *"Mahallendeki fırından restorana, gün sonunda çöpe gidecek taze yiyecekleri üçte bir fiyatına kurtar — cebine de gezegene de iyi gelir."*

### 5.6 Hukuki/operasyonel kurulum (zaman çizelgeli)
**Şirket kararı: HummyTummy'den ayrı YENİ A.Ş.** — risk izolasyonu (müteselsil iade + gıda ihtilafı SaaS'a bulaşmasın), yatırım mekaniği (hisse/SAFE notersiz), marka ayrışması. Maliyet ~33-42k ₺ + 250k sermaye taahhüdü (62,5k blokaj — şirket hesabına döner; doğrulanmış).

| Tarih | Adım |
|---|---|
| 1-15 Eyl | A.Ş. (MERSİS) + mali müşavir + banka + **KEP** (~215 ₺/yıl) + **Apple DUNS hemen (kritik yol)** |
| 8-19 Eyl | **Çift PSP başvurusu paralel:** iyzico Pazaryeri ("Bize Ulaşın" kanalı; alt-üye split belgeli; blokaj süresi sözleşmede netleşsin) + PayTR (mevcut ilişki; platform-transfer koşullarını yazılı sor). Onay 2-6 hafta |
| 15-30 Eyl | **ETBİS kaydı** + avukatla sözleşme seti: aracılık sözleşmesi (15-gün şikayet, 48s takedown, ≤5 iş günü ödeme, **endeksleme maddesi**), kullanıcı sözleşmesi, KVKK+VERBİS, mesafeli satış + **sürpriz paket ön bilgilendirme** (alerjen uyarısı, cayma istisnası açıkça, STT yasağı, TETT MVP-dışı) |
| 1-10 Eki | Google Play ($25) + Apple Developer ($99/yıl, DUNS'la) + marka tescil başvurusu |
| 10-31 Eki | e-Fatura/e-Arşiv geçişi (yasal 3 ay penceresi) + muhasebeci brifi (%1 stopaj muhtasarı, komisyon KDV, mahsuplu üyelik) + PSP sandbox'ta split+payout provası |

### 5.7 Rekabet stratejisi
- **SonPaket'e karşı (şu an 0 paket/0 partner — pencere açık):** hız her şey; ağ etkisi yereldir — Kadıköy'ü kazanan İstanbul'u kazanır. **Bölgesel münhasırlık VERME** (hukuki yük + ölçek kısıtı); onun yerine fiili kilit = Kurucu Üye paketi. Fiyat savaşında paket ücretini asla kalıcı sıfırlama; cevap üyelik muafiyeti uzatması + likidite anlatısı ("bizde paketin gerçekten satılıyor").
- **TGTG girerse:** 12-24 ay yerel yoğunluk avantajı; savunma = yüz yüze arz ilişkileri (TGTG uzaktan onboard eder) + TÜFE-endeksli ₺ yapı + manav/lokanta yerelleştirmesi + İstanbul'da %70+ mahalle kapsaması.

### 5.8 KPI panosu (haftalık)
Aktif işletme (7g'de ≥1 yayın; 20→500) · günlük yayınlanan paket (≥1,5/işletme) · **paket giriş oranı** (≥%70 — "girmeyi unutma" erken uyarısı) · DAU/WAU (WAU/kayıt ≥%25) · sell-through (%65-80; %90+ = arz açığı) · no-show (≤%5) · paket başı net katkı (≥20 ₺) · ortalama puan (≥4,3) · şikayet SLA (yasal ≤15 gün, iç hedef ≤48s ilk yanıt) · 4-hafta tekrar alım (≥%35) + işletme churn (≤%5).

### 5.9 6 aylık kilometre taşları (teknik dalga takvimiyle hizalanmış)
| Ay | Hedef |
|---|---|
| Eyl 2026 | Evrak seti (A.Ş./KEP/ETBİS/PSP/marka/DUNS) + Wave 1 inşası başlar + Kadıköy'de 20 ön anlaşma |
| Eki-Kas | Wave 1 biter → **kapalı pilot**: 20-30 işletme, 300-500 beta (TestFlight), gerçek para + 5-iş-günü payout provası |
| Ara 2026 | Wave 2 (parite) biter → **public lansman** (Kadıköy+Beşiktaş): 75-100 işletme, PR dalgası, 5k kayıt hedefi. (İş ajanının Kasım hedefi teknik takvime göre agresif — Aralık gerçekçi) |
| Oca 2027 | Şişli+Beyoğlu: 150-200 işletme, 10k kullanıcı, sell-through ≥%70 |
| Şub 2027 | 300 işletme, ilk yerel zincir pilotu, self-serve ile İzmir/Ankara organik girişleri, 20k kullanıcı |
| Mar 2027 | 400-500 işletme, 30-35k kullanıcı, **Senaryo B başabaşına yaklaşma**; seed turu veri odası |

### 5.10 İlk 10 iş riski (erken uyarı → mitigasyon)
1. **İşletme paket girmeyi unutuyor** (TGTG'nin 1 numaralı derdi; giriş oranı <%60) → varsayılan **tekrarlayan paket** + kapanış-öncesi hatırlatma + concierge.
2. No-show >%8 → tam ön ödeme + iade yok (cayma istisnası) + ilk seferde goodwill kuponu.
3. 5-iş-günü × PSP blokaj nakit akışı → split ürünüyle para doğrudan alt-üyeye; blokaj süresi sözleşmede yazılı.
4. Apple reddi → DUNS erken, demo hesap, marketplace açıklamalı review notu.
5. SonPaket fiyat savaşı → kurucu kilidi, kalıcı sıfır ücret yok.
6. Düşük sell-through (<%50 iki hafta) → ilçe yoğunlaştır, fiyat bandı düşür, push saati optimize.
7. Gıda güvenliği olayı → sözleşmede sorumluluk dağılımı, denetim karekodu zorunlu, 48s takedown, kriz protokolü, ürün sorumluluk sigortası araştır.
8. STT/TETT ihlali → TETT MVP-dışı, eğitim modülü, mystery-shopper, anında askıya alma.
9. Regülasyon değişikliği → hukuk aboneliği + sözleşmede revizyon maddesi.
10. Saha ölçeklenmiyor / tek-kurucu darboğazı → yazılı playbook + kapanış primi; 2. satışçı başabaş A sonrası.

## 6. Doğrulama (plan uygulanırken)

- **Para yolu:** realdb spec'ler (oversell yarış testi: paralel 50 istek × qty 5 ⇒ tam 5 CONFIRMED; webhook idempotency ×3 ⇒ tek settle; tutar mutabakat sapması ⇒ settle yok; batch matematiği kuruş invariantları; iş-günü/tatil fikstürü). Muhasebeci-onaylı örnek batch golden fikstürü.
- **CI:** gerçek PostGIS'li Postgres service container'da e2e (`prisma db push`), i18n parity, contract drift; migration'lar up/down + migration-doctor preflight (global kural: her migration geri alınabilir).
- **PSP sandbox uçtan uca:** alt-üye onboarding → split ödeme → blokaj → iade → payout, canlıya geçmeden prova (Eki sonu).
- **Yük:** k6 nightly — 20k eşzamanlı, 500 offer publish, %10 satın alma; hedef p95<500ms, sıfır oversell. Publish jitter + BullMQ push rate-limit doğrulaması.
- **Mobil:** Maestro e2e (OTP→satın al→redeem); Apple review için demo hesap + video.
- **Kapalı pilot kabul kriterleri (public lansman gate'i):** ≥%95 başarılı redeem, sıfır kayıp para (PSP mutabakatı temiz), payout'lar ≤5 iş günü, sell-through ≥%50, giriş oranı ≥%60, ETBİS+KEP+sözleşme seti tamam.

## 7. Açık kalemler (kullanıcı kararı / ileri doğrulama)

- **Marka ismi:** "Kurtar" önerisi; domain WHOIS/TRABIS teyidi + Türk Patent ön araştırması yapılmadan kesinleşmez.
- **PSP seçimi:** iyzico Pazaryeri birincil öneri; PayTR platform-transfer yazılı teklifle karşılaştırılacak (registry seam iki adapteri de taşır).
- **Yeni A.Ş. kuruluşu:** öneri net ama kuruluş masrafı/sermaye taahhüdü kullanıcı onayı ister.
- Fiyat rakamları (69/119/149/169/99 ₺, ücret 25 ₺+KDV, üyelik 1.990 ₺) **öneri**dir; kapalı pilotta elastikiyete göre ayarlanır.
