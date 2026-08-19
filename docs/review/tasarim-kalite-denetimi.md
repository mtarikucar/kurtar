# Design-quality audit — the dimensions nobody had checked

Seven read-only auditors (motion/reduced-motion, screen reader, dynamic type,
touch targets & safe area, slow-Android performance, the existing backlog,
language & copy), each finding put through a separate agent whose job was to
REFUTE it. **33 survived, 23 were killed.** The killed ones are listed at the
bottom so nobody raises them again.

Severity is what it costs a real user, not how hard it is to fix.

---

## 1. [HIGH] The handover flood never ends: TeslimSeli's effect is re-armed once a second by the redeem screen's 1Hz rail, so the light never fades and the confirmation underneath is never revealed. — **FIXED** (`7a6b313`)

`apps/consumer/src/components/teslim/TeslimSeli.tsx:71` · dimension: hareket

**What goes wrong**

A customer taps TESLİM ALDIM at the counter. The screen floods #FFC864→#FFF1DC as specified — and then stays that way forever. TeslimSeli's effect lists `onBitti` in its deps (line 71), and redeem/[id].tsx:373 passes a fresh inline arrow `() => setSelBitti(true)` on every render. The redeem screen re-renders every second because `useSaniyeTiki()` is mounted at its root (redeem/[id].tsx:120), so once per second the cleanup runs `dizi.stop()` and a brand-new Animated.sequence starts: ramp to opacity 1 (already 1, invisible), delay 2200ms, fade out — but the fade is always killed at the ~1s mark before it can begin. `dizi.start(({finished}) => ...)` therefore never fires with `finished: true`, `onBitti` is never called, `selBitti` stays false, and the full-bleed overlay is never unmounted. Spec §4.5 says the flood lasts 2.5s and then "settles into the order ticket with the impact line: `Kadıköy'de 13. kepenk`". Instead the ticket, the frozen handover time, the impact line and BOTH action buttons (Değerlendir / Siparişlerim) sit permanently behind an opaque gradient, on a phone that `useTezgahModu(true)` is holding at brightness 1.0 with auto-lock disabled. There is no back control in the success branch, so the user's only exits are blind taps through the `pointerEvents="none"` overlay or force-quitting. The reduced-motion branch has the identical defect: its `setTimeout(..., m.floodHold)` is cleared and restarted every second too, so a vestibular user is left with the same stuck lamp. This is invisible to the review harness — `EXPO_PUBLIC_INCELEME_ZAMANI` pins the clock, and a pinned ClockProvider's `saniyeAbone` fires once and returns a no-op unsubscribe (design/saat.tsx:98-101), so the screen never re-renders and the flood completes correctly in every review build. `__tests__/teslim-kepenk-ekrani.test.tsx:272` only asserts the flood APPEARS; nothing asserts it goes away.

**Fix**

TeslimSeli.tsx içinde callback'i ref'te tutup efekti bir kez kurmak: `const bittiRef = useRef(onBitti); bittiRef.current = onBitti;` ekle, efektin içinde `const sonra = () => bittiRef.current?.();` yap ve satır 71'deki bağımlılıkları `[azaltHareket, parlaklik]` olarak daralt (onBitti'yi çıkar). Alternatif tek satırlık düzeltme redeem/[id].tsx:373'te `onBitti={useCallback(() => setSelBitti(true), [])}` — çalışır ama saniyede bir render olan bir ekranda her gelecek çağıranın memoize etmesini şart koşan kırılgan sözleşmeyi bırakır.

---

## 2. [HIGH] The reduced-motion redeem handle makes a press-and-hold gesture the ONLY way to open the shutter: it never counts failed attempts, so the "Kaldıramıyor musun?" escape hatch can never appear, and its button role has no activate action.

`apps/consumer/src/components/teslim/KepenkKolu.tsx:152` · dimension: hareket

**What goes wrong**

A customer with reduce-motion enabled reaches the counter and gets the press-and-hold substitute (`basiliTut = azaltHareket === true`, line 78). They press, and lift at ~400ms because 600ms is longer than it feels — `basmayiBirak` (line 152) clears the timer and resets the fill, but unlike the drag path (line 98, `setBasarisiz(sayi => sayi + 1)`) it never increments `basarisiz`. They try again, lift early again. The `basarisiz >= YARDIM_ESIGI` help button at line 268 is therefore unreachable in this mode, forever — the one affordance §4.5 promises ("a persistent `Kaldıramıyor musun?` text button after two failed drags") is disabled for exactly the users who most need an alternative. Worse, the press-and-hold Pressable (lines 243-252) declares `accessibilityRole="button"` but wires only `onPressIn`/`onPressOut` — no `onPress`, no `accessibilityActions`/`onAccessibilityAction` (the drag branch at lines 254-263 has both). So a Switch Control, Voice Control or (on the web build) keyboard user who activates that button gets nothing at all, and there is no other control on the screen that reveals the code. This is §5.11 verbatim: "Do not require the gesture — the plain button path is not optional." In the reduced-motion branch, a gesture is the only path.

**Fix**

Two small edits in apps/consumer/src/components/teslim/KepenkKolu.tsx, both inside the reduced-motion path.

1. Count an early release as a failed attempt, so the existing help-button gate at line 268 works unchanged. The timer ref must be nulled when it fires, or a successful hold's `onPressOut` would be miscounted as a failure (clearTimeout on an already-fired timer is a silent no-op, so `basiliTimer.current !== null` is true on success too).

Line 149:
-    basiliTimer.current = setTimeout(onKaldir, BASILI_TUT_SURESI);
+    basiliTimer.current = setTimeout(() => {
+      basiliTimer.current = null;
+      onKaldir();
+    }, BASILI_TUT_SURESI);

Lines 153-156, in `basmayiBirak`:
     if (basiliTimer.current !== null) {
       clearTimeout(basiliTimer.current);
       basiliTimer.current = null;
+      // Lifted before the fill completed — the same failed attempt the
+      // drag counts, so the "Kaldıramıyor musun?" way out can appear.
+      if (!kilitli) setBasarisiz((sayi) => sayi + 1);
     }

2. Give the press-and-hold Pressable the activate action its drag sibling already has (lines 243-252):

     <Pressable
       accessibilityRole="button"
       accessibilityLabel={t("kepenk.kolErisim")}
       accessibilityState={{ disabled: kilitli }}
       testID="kepenk-kol-basili"
       onPressIn={basmayaBasla}
       onPressOut={basmayiBirak}
+      accessibilityActions={[{ name: "activate" }]}
+      onAccessibilityAction={kilitli ? onKilitliDeneme : onKaldir}
     >

No i18n change (`kepenk.yardim` and `kepenk.kolErisim` already exist in both tr.json and en.json), no change to `perde.ts`, no change to the help button's render condition.

---

## 3. [HIGH] Form hatası ekran okuyucuya hiç duyurulmuyor — yanlış OTP kodu sessizce yutuluyor

`apps/consumer/src/components/TextField.tsx:89` · dimension: ekran-okuyucu

**What goes wrong**

TalkBack açık bir kullanıcı /(auth)/otp ekranında 6 haneli kodu yanlış giriyor ve "Doğrula"ya basıyor. otp.tsx:86 setVerifyError() ile hata TextField'a `error` olarak geçiyor; TextField bunu düz bir <View><Text> olarak çiziyor — `accessibilityLiveRegion` yok, TextInput'a hiçbir geçersizlik durumu (aria-invalid / accessibilityErrorMessage) verilmiyor, odak da butonda kalıyor. Kullanıcı HİÇBİR ŞEY duymaz: ekran değişmemiş gibi gelir. Aynı kodu tekrar dener, tekrar sessizlik alır ve arka uçtaki 24 saatlik kilitlenmeye kadar gider. Uygulamanın ön kapısı bu ve tamamen kapanır. Aynı sessiz-hata deseni purchase/[offerId].tsx:316, redeem/[id].tsx:544, complaint/new.tsx:98 ve report/new.tsx:216'daki hata metinlerinde de var (uygulamada `accessibilityLiveRegion` sadece TeslimSeli.tsx:78'de kullanılmış).

**Fix**

Tek dosya, tüm çağrı yerlerini (otp, phone, search) birden düzeltir — TextField.tsx:

1. Hata şeridini canlı bölge yap (Android + RN Web `aria-live`):
   `<View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={[styles.uyari, {backgroundColor: palet.tenteDolgu}]}>`
2. iOS'ta canlı bölge desteği olmadığı için tek satırlık duyuru ekle (Android'de çift okumayı önlemek için platformla korunmuş):
   `useEffect(() => { if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(`${label}: ${error}`); }, [error, label]);`
   (`AccessibilityInfo`, `Platform` react-native'den import; desen zaten redeem/[id].tsx:247'de kullanılıyor.)

Not: iddiadaki `aria-invalid` kısmı RN'de karşılıksız — `accessibilityState`'in `invalid` alanı yok, o yüzden düzeltmenin parçası değil. Aynı iki prop, elle çizilmiş dört hata metnine de uygulanmalı: purchase/[offerId].tsx:316, redeem/[id].tsx:544, complaint/new.tsx:98, report/new.tsx:85 (216 değil) — ama iddia edilen OTP arızası için asgari düzeltme yalnızca TextField.tsx'tir.

---

## 4. [HIGH] Dükkân sayfasındaki teklif satırı fiyatı, alış penceresini ve zaman hapını yutuyor

`apps/consumer/src/app/store/[id].tsx:211` · dimension: ekran-okuyucu

**What goes wrong**

TeklifSatiri'ndeki Pressable'a `accessibilityLabel={teklif.template.title}` veriliyor. React Native'de Pressable `accessible: accessible !== false` ile gelir (node_modules/react-native@0.86.2 .../Pressable/Pressable.js:252), dolayısıyla açık etiket çocukların metnini EKLEMEZ, yerine geçer. Sonuç: satırda çizilen fiyat (149₺), alış penceresi (18:30–21:00), değer bandı ve ZamanHapi ("25 dk" / "SON 18 DK") ekran okuyucuya hiç ulaşmaz. Favorilerinden bir dükkâna giren kör kullanıcı sadece "Fırından Sürpriz Paket", "Akşam Kutusu" duyar; hangisinin kaça olduğunu, hangisinin kapanmak üzere olduğunu öğrenmek için her birini tek tek açıp geri dönmek zorunda kalır.

**Fix**

store/[id].tsx:211'deki tek satırlık etiketi, satırın ZATEN hesapladığı çevrili parçalardan oluşan bileşik bir etiketle değiştir. Yeni i18n anahtarı gerekmez (hepsi tr.json+en.json'da mevcut), böylece CI locale parity'ye dokunulmaz:

  accessibilityLabel={[
    teklif.template.title,
    fiyatMetni(teklif.template.priceCents),
    t("vitrin.degerBandi", {
      band: degerBandiMetni(
        teklif.template.originalValueCentsMin,
        teklif.template.originalValueCentsMax,
      ),
    }),
    formatPickupWindow(teklif.pickupStartAt, teklif.pickupEndAt),
    durum === "tukendi"
      ? t("vitrin.tukendi")
      : durum === "acilmadi"
        ? t("vitrin.acilis", { saat: saatBulunma(formatClockTime(baslangic)) })
        : t("vitrin.sureDk", { dk: kalanDakika(simdi, bitis) }),
  ].join(". ")}

Böylece satır "Fırından Sürpriz Paket. 149₺. 180–300₺ değerinde. 18:30–21:00. 18 dakika." olarak duyulur ve tükenmiş teklif "TÜKENDİ" ile ayrışır. (İstenirse VitrinKarti/OrderRow'daki gibi dekoratif ZamanHapi'ye accessibilityElementsHidden + importantForAccessibility="no-hide-descendants" eklenebilir, ama Pressable zaten accessible olduğu için düzeltme için şart değil.)

---

## 5. [HIGH] Teklif kartının meta rayı (alış penceresi · mesafe · stok çipi) yazı ölçeği ≥1,3'te kartın altından kırpılıyor

`apps/consumer/src/components/kepenk/VitrinKarti.tsx:83` · dimension: yazi-olcegi

**What goes wrong**

Telefonunda yazıyı büyüten bir kullanıcı Keşfet listesini açıyor. fontScale ≥1,3'te kart 196→232pt büyüyor (tokens.ts:613), ama kaldırım bloğuna düşen boşluk yalnızca 80→98pt artıyor (232−2 kenarlık −6 tente −78 band −48 tabela), paddingBottom sonrası 96pt. İçerik ise: paket 20×1,3=26 + fiyat satırı 28×1,3=36,4 + (buyuk'ta artık ALT SATIRA inen) değer bandı 16×1,3=20,8 + çubuk 4 + meta 16×1,3=20,8 = 108pt; 1,4 ve üstü tavanlarda 112,8pt. `justifyContent:'space-between'` negatif boşlukta flex-start gibi davranıyor ve `styles.kart`'ın `overflow:'hidden'`'ı son satırı yiyor: 20,8pt'lik meta satırının yalnızca ~4-6pt'i görünüyor. Yani "19:00–21:00 · 399 m · 5 dk" ve "son 3" çipi her kartta yok oluyor — alış penceresi, asla kırpılmaması gereken dört şeyden biri. iOS'ta XXL (1,235×) gibi erişilebilirlik dışı bir ayarda bile kart büyümediği için 78pt'lik alana 83,1pt giriyor, ~5pt kırpılıyor.

**Fix**

En küçük doğru düzeltme tek bir token: `apps/consumer/src/design/tokens.ts:613` → `yukseklikBuyuk: 232` yerine `yukseklikBuyuk: 252`. Bu, kaldırıma 230→250 iç kutuda 118pt (padding sonrası 116pt) verir ve en kötü hal olan 112,8pt'i (fontScale ≥1,4 tavanları) da kapsar; `yukseklikBuyuk`'u başka tüketen yok (VitrinKarti.tsx:83 ve KapaliKart.tsx:30 zaten okuyor). Yanına zorunlu ikinci satır: `src/app/(tabs)/index.tsx:165` `const satirYuksekligi = kart.yukseklik + kart.aralik;` da `buyuk` dalını yansıtmalı (`(PixelRatio.getFontScale() >= kart.buyumeEsigi ? kart.yukseklikBuyuk : kart.yukseklik) + kart.aralik`), yoksa `getItemLayout` ofsetleri büyük yazıda kart başına ~56pt kayar ve `scrollToIndex` (harita pinine tıklama) yanlış karta gider — `kart.satirYuksekligi` sabiti de aynı sebeple yalnız 196'yı varsayıyor.

---

## 6. [HIGH] Tabela'nın harf ölçüsü 1×'te hesaplanıyor, sonra metin 1,4×'e kadar büyüyor: yazı ölçeği ≥1,3'te dükkân adı kesiliyor

`apps/consumer/src/components/kepenk/Tabela.tsx:38` · dimension: yazi-olcegi

**What goes wrong**

tabelaOlcusu() adı plakaya sığdıran boyutu Archivo Black'in kendi advance'larıyla hesaplıyor, ama `PixelRatio.getFontScale()`'i hiç sormuyor; hemen altında (satır 70) metin `maxFontSizeMultiplier=1,4` ve `allowFontScaling` açık, `numberOfLines={1} ellipsizeMode="tail"`. Sonuç: sığdırma 1× için yapılıyor, çizim 1,3–1,4× ile oluyor. 390pt telefonda listedeki kart 313pt (duzen.ts), plakanın iç genişliği 257pt. "YELDEĞİRMENİ PASTANESİ" 17pt'ye sığdırılıyor (255/257pt), 1,3× ile 22,1pt'te 333pt oluyor → "YELDEĞİRMENİ PA…". Tohumlanmış 7 dükkândan 5'i kesiliyor (Beşiktaş Manav Ali Usta → "BEŞİKTAŞ MANAV AL…", Mecidiyeköy Ocakbaşı → "MECİDİYEKÖY OC…", Barbaros Lokantası, Caferağa Kahve Evi). 360dp'de daha da kötü. Bu, tabela-olcu.ts'in doc-string'inde "bir sign that cannot say the shop's name is a broken sign" diye tarif ettiği hatanın ta kendisi — sadece büyük yazıda geri geliyor. Aynı hata DetayBasligi.tsx:78/160'ta da var (orada da numberOfLines={1}).

**Fix**

Sığdırma bütçesini, metnin gerçekten çizileceği çarpana bölmek — tek satırlık değişiklik.

Tabela.tsx (satır 38, `PixelRatio` import'u eklenerek):

```ts
import { PixelRatio, StyleSheet, Text, View } from "react-native";
...
// The type is drawn at the user's text size; fit it at that size, not at 1×.
const olcek = Math.max(
  1,
  Math.min(PixelRatio.getFontScale(), yazi.tabelaLg.maxFontSizeMultiplier ?? 1),
);
const olcu = tabelaOlcusu(yazit, (genislik - 2 * s.s3 - 12 - 6 - 12) / olcek);
```

`Math.max(1, …)` küçük-metin (0,85) durumunu aynen bırakır, `Math.min(…, 1.4)` ise RN'in zaten uyguladığı tavanı aşan gereksiz küçültmeyi engeller. 14pt tabanı korunur (o taban zaten 1×'te de "KADIKÖY ÇİĞKÖFTECİ ÖMER USTA & OĞULLARI"yi kesiyor — bu ayrı ve kabul edilmiş davranış).

Aynı satırlık düzeltme DetayBasligi.tsx:78'e de uygulanmalı (`detayTabelaBoyutu(yazit, icGenislik / olcek)`, `yazi.tabelaXl.maxFontSizeMultiplier` ile). İsteğe bağlı ama ucuz: kepenk-olcum.test.ts'e 1,3× bütçesiyle (257/1.3 ≈ 197,7) çağrılan bir vaka ekleyip 7 seed adının 1,3×'te de plakaya sığdığını sabitlemek.

---

## 7. [HIGH] Kepenk (teslim) ekranında TESLİM ALDIM düğmesi ve "yanlışlıkla açtım" geri alma, büyük yazıda ekran dışında kalıyor — kaydırma yok, kap `overflow:'hidden'`

`apps/consumer/src/app/redeem/[id].tsx:649` · dimension: yazi-olcegi

**What goes wrong**

`vitrin` flex:1 + overflow:hidden ve içindeki tek akış çocuğu `acikIcerik` (flex:1); ScrollView yok (AcikDukkan ve TamKepenk absolute). 375×667 bir iPhone SE'de ya da ~360×740 Android'de, en büyük yazı adımında: üst çubuk 48 + HeroTabela (ad 1,4× ile iki satıra sarıyor, satır yüksekliği (44+6)×1,4=70 → plaka ~167pt) + ilçe 20,8 = 236pt; vitrin'e 411pt kalıyor. acikIcerik'in gerektirdiği: padding 24 + saat 71 + tarih 20,8 + kod bloğu 113,6 (44×1,6=70,4 satır) + ayraç 25 + paket adı 30,8 + ödendi 26 + sayaç 20,8 + boşluklar + eylem (16+56) + geri alma (68) ≈ 536pt. `derinlik` (flexGrow/flexShrink 1) sıfıra inse bile ~125pt taşıyor ve overflow:hidden bunu kesiyor. Tezgâhın önünde duran az gören müşteri teslimi onaylayamıyor ve kepengi geri indiremiyor.

**Fix**

İki küçük değişiklik, varsayılan yazı boyutunda tek piksel oynatmadan:

1) `apps/consumer/src/app/redeem/[id].tsx:467` — açık içeriği ölçülen açıklığın İÇİNDE kaydırılabilir yap (kepenk yolu `vitrin`'in ölçüsünden türediği için `vitrin` ve mutlak kardeşleri hiç değişmez):
```tsx
<ScrollView
  style={styles.acikKaydirma}          // { flex: 1 }
  contentContainerStyle={styles.acikIcerik}
  showsVerticalScrollIndicator={false}
  testID="kepenk-acik"
>
  … (mevcut çocuklar aynen) …
</ScrollView>
```
ve `:654-660`'ta `acikIcerik`'in `flex: 1`'ini `flexGrow: 1` yap (+ `acikKaydirma: { flex: 1 }` ekle). `flexGrow: 1` sayesinde `derinlik` normal ölçekte düğmeyi hâlâ açıklığın dibine itiyor; sığmadığında kolon kırpılmak yerine kayıyor. `ScrollView` `TamKepenk`'ten ÖNCE render edildiği için koldaki PanResponder üstte kalır, kaldırma jesti etkilenmez.

2) `apps/consumer/src/app/redeem/[id].tsx:579` — ekrandaki tek tavansız metne tavan koy:
```tsx
<Text style={[yazi.body, { color: palet.yaziSisCukur }]} maxFontSizeMultiplier={1.4}>
```
(Tek başına yetmez, ama erişilebilirlik adımlarında 3,57× büyüyüp üç satıra saran bu etiket taşmanın en büyük tek kalemi.)

i18n/kopya değişmiyor, `tr.json`/`en.json` dokunulmuyor.

---

## 8. [HIGH] The sticky CTA bar takes no bottom safe-area inset, so the buy button sits under the Android navigation bar / iOS home indicator.

`apps/consumer/src/components/teslim/ortak.tsx:286` · dimension: dokunma-hedefi

**What goes wrong**

YapiskanCubuk's only bottom spacing is paddingBottom: s.s4 (16pt), and both of its hosts declare edges={["top","left","right"]} — offer/[id].tsx:197 and purchase/[offerId].tsx:170 — so the bar's bottom edge IS the physical screen edge. The Dugme inside it is 56pt. On Expo SDK 57 / RN 0.86 Android edge-to-edge is mandatory, so on a phone with 3-button navigation the system bar (~48pt) is painted over the app's bottom 48pt: the CTA's lower 32pt is behind Back/Home/Recents. A user standing in the doorway taps the bottom half of 'KUTUYU AYIR · 149₺' and goes to the Android home screen instead of buying. On an iPhone with a home indicator the bottom 18pt of the same button is inside the gesture strip, so a thumb that presses and drags slightly dismisses the app. The same file's own tab bar sibling ((tabs)/_layout.tsx:69-71) already does this correctly — it ADDS useSafeAreaInsets().bottom to both height and paddingBottom — so the convention exists and this bar does not follow it.

**Fix**

En küçük doğru düzeltme TEK dosyada: ortak.tsx'te YapiskanCubuk inset'i kendisi ödesin. Ev sahiplerinin edges'ine "bottom" EKLEMEK yanlış olur — o, kök kabı içeri iter ve yüzen çubuğun ALTINDA bir şerit asfalt bırakır; çubuk fiziksel kenara kadar boyanmaya devam etmeli, sadece içeriği sistem çubuğunu geçmeli. Sekme çubuğunun (tabs)/_layout.tsx:35,71'deki deseninin aynısı:

  // ortak.tsx, üst kısma:
  import { useSafeAreaInsets } from "react-native-safe-area-context";

  export function YapiskanCubuk({ children, palet }: { children: ReactNode; palet: Palet }) {
    const altBosluk = useSafeAreaInsets().bottom;
    return (
      <View
        style={[
          styles.yapiskan,
          YUZEN,
          {
            backgroundColor: palet.yuzeyYukselti,
            borderTopColor: palet.bgDerin,
            paddingBottom: s.s4 + altBosluk,   // <- styles.yapiskan'daki 16'yı geçersiz kılar
          },
        ]}
      >
        {children}
      </View>
    );
  }

styles.yapiskan'daki `paddingBottom: s.s4` taban değer olarak kalabilir (inline stil onu ezer) — böylece
sağlayıcısız bir render'da bile 16pt garanti. offer/[id].tsx:197 ve purchase/[offerId].tsx:170'e
dokunulmuyor. react-native-safe-area-context (~5.7.0) zaten kurulu.

---

## 9. [HIGH] The map tab's bottom sheet is a fixed 180pt with no scroll, so the third of its three offers overflows 65pt and is covered by the tab bar.

`apps/consumer/src/app/(tabs)/harita.tsx:156` · dimension: dokunma-hedefi

**What goes wrong**

altSayfa is height: ALT_SAYFA_YUKSEKLIGI (180) with borderTopWidth 1 + paddingTop 8, and the altBaslik label eats another 20pt (yazi.label lineHeight 16 + paddingBottom s.s1). Each HaritaSatiri is exactly height: 72 (HaritaSatiri.tsx:91) and YAKINDAKI_ADET is 3. Rows therefore land at 29-101, 101-173 and 173-245 inside a 180pt box that is not a ScrollView. The third row overflows by 65pt straight into the tab bar (70pt + bottom inset), which is a later sibling and paints over it. A user who opens Harita to compare the three offers closing soonest sees two, and the third — which by the screen's own sort is often the one closing FIRST relative to the pins they are looking at — is neither visible nor tappable, with nothing on screen to indicate it exists. Existing coverage misses it: harita-screen.test.tsx only ever seeds two visible offers.

**Fix**

One word in `apps/consumer/src/app/(tabs)/harita.tsx:156`: change `height: ALT_SAYFA_YUKSEKLIGI` to `minHeight: ALT_SAYFA_YUKSEKLIGI`. The sheet then resolves to 245pt when three rows are present (all three visible and tappable) and stays at 180pt for the `bosDurum` empty state, whose `flex: 1` still centres correctly against the resolved minHeight. The map is `flex: 1` (styles.harita) so it simply yields the 65pt; nothing else moves. Optionally, to keep the constant honest, derive it rather than leaving a stale 180 comment: `const ALT_SAYFA_YUKSEKLIGI = 1 + s.s2 + yazi.label.lineHeight + s.s1 + YAKINDAKI_ADET * 72;` (exporting the row height from HaritaSatiri instead of the literal 72). Then extend `harita-screen.test.tsx` with a three-OPEN-offer case asserting all three names render, since the current fixture's sold-out third offer is why this was never caught.

---

## 10. [HIGH] On iOS the keyboard covers the OTP verify and resend buttons on a screen that cannot scroll, so sign-in dead-ends.

`apps/consumer/src/app/(auth)/otp.tsx:216` · dimension: dokunma-hedefi

**What goes wrong**

styles.icerik is { flexGrow: 1, justifyContent: 'center' }, so when the content is shorter than the viewport the ScrollView's contentSize equals its frame and it cannot scroll at all. There is no KeyboardAvoidingView anywhere in the auth flow (the only one in the app is complaints/[id].tsx:73) and automaticallyAdjustKeyboardInsets is not set, so on iOS the window does not resize when the keyboard opens. Measured against the actual layout — GirisCephesi (Cephe: 8pt tente + 92pt band + 32pt padding + HeroTabela) ≈ 190pt, title 42, subtitle 22, form 124, secondary buttons 112, 24pt padding each end ≈ 588pt centred in ~797pt on an iPhone 13 — the 'Doğrula' button lands at roughly y 543-591 and both secondary buttons below it, while the number-pad keyboard's top edge is at about y 553. keyboardType is 'number-pad', which has no return key, and the field has no onSubmitEditing. So a user types the 6-digit SMS code and there is no way to submit it: the button is behind the keyboard and the screen will not scroll. They have to guess that tapping the artwork dismisses the keyboard. It is worse on an iPhone SE. phone.tsx:216 has the identical layout and the identical trap ('phone-pad' also has no return key, so its onSubmitEditing at line 87 never fires).

**Fix**

Her iki auth ScrollView'una tek prop ekle — iOS'ta klavye yüksekliğini contentInset.bottom olarak ekler (contentSize == frame olsa bile ~291pt kaydırma menzili doğar ve odaklı alanı görünür tutar), Android/web'de no-op:

apps/consumer/src/app/(auth)/otp.tsx:127-131
    <ScrollView
      contentContainerStyle={styles.icerik}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >

apps/consumer/src/app/(auth)/phone.tsx:58-62 — aynı satır.

(İsteğe bağlı ikinci küçük dokunuş, aynı dosyada: phone.tsx:86'daki returnKeyType="send"/onSubmitEditing iOS'ta ölü kod; ya kaldır ya da otp.tsx'e 6 hane dolunca otomatik doğrulama ekle. Ama kusuru kapatan asıl düzeltme yukarıdaki tek prop.)

---

## 11. [HIGH] Payment screen shows three contradictory messages and no action when the provider WebView fails

`apps/consumer/src/app/payment/[id].tsx:151` · dimension: dil-ve-metin

**What goes wrong**

A user taps ÖDEMEYE GEÇ, the reservation is created (PENDING_PAYMENT, stock held), then the PayTR WebView 404s or the connection drops (`onError`/`onHttpError` sets `webHatasi`). The screen now stacks, top to bottom: `payment.waiting` = "Ödeme sağlayıcısında işlemini tamamla. Onaylandığında otomatik olarak devam edeceğiz." (finish paying at the provider), `payment.loadError` = "Ödeme sayfası açılamadı." (the payment page could not be opened), and `payment.checking` = "Ödeme durumu kontrol ediliyor…" (we are checking your payment status). Three statements that cannot all be true, none of which says what to do. There is no retry button; the only affordance is the ✕, which opens "Ödemeden vazgeç?". The user has an unpaid reservation holding stock and no instruction. This is the app's single most expensive copy moment.

**Fix**

En küçük doğru düzeltme — yeni i18n anahtarı GEREKTİRMEZ (`common.retry` hem tr.json hem en.json'da zaten var, parity riski yok):

`apps/consumer/src/app/payment/[id].tsx`:
1. 141-146'daki `payment.waiting` Text'ini koşullu hale getir: yalnızca WebView dalında (else) render et. Böylece hata durumunda ekranda "sağlayıcıda tamamla" bayat talimatı kalmaz.
2. 148-156'daki hata bloğuna, `loadError` + `checking` altına tek bir eylem koy — mevcut `PanelButton` (`src/components/panel/PanelButton.tsx`) ile:
   `<PanelButton label={t("common.retry")} onPress={() => { setWebHatasi(false); setDeneme((n) => n + 1); }} testID="odeme-yeniden-dene" />`
   ve WebView'a `key={deneme}` ver (`const [deneme, setDeneme] = useState(0);`) ki gerçekten yeniden mount olsun. `!redirectUrl` dalında buton anlamsız olduğu için koşulu `webHatasi ? <retry/> : null` yap.

Sonuç: hata ekranı "Ödeme sayfası açılamadı." + "Ödeme durumu kontrol ediliyor…" + "Tekrar dene" olur — çelişki kalkar, kullanıcıya ne yapacağı söylenir, PENDING_PAYMENT rezervasyonu sweeper'ı beklemeden kurtarılabilir.

---

## 12. [HIGH] `orders.aliniyor` hardcodes "BUGÜN", so an uncollected order tells the user to go to the shop today, forever

`apps/consumer/src/i18n/tr.json:176` · dimension: dil-ve-metin

**What goes wrong**

`orders.aliniyor` = "BUGÜN {{pencere}} arası al" asserts TODAY unconditionally, and is rendered for every CONFIRMED reservation at apps/consumer/src/app/order/[id].tsx:158. Nothing in the backend ever writes NO_SHOW (backend/src/modules/reservations/reservation-transitions.ts:10 — "CANCELLED_BY_MERCHANT and NO_SHOW have no endpoint yet") and EXPIRED is only reachable from PENDING_PAYMENT, so a reservation the user never collected stays CONFIRMED permanently. A user who forgets Tuesday's bag opens Siparişler on Friday and reads "BUGÜN 18:30–21:00 arası al" over a live-looking KEPENGİ AÇ button and a ZamanHapi that shows red "SON 0 DK" — they are told to walk to a shop for a window that closed three days ago. The same string in `payment.arasindaAl` (tr.json:247, rendered at components/teslim/OnayEkrani.tsx:167) is wrong on purchase too whenever the pickup window is not today: discovery's SQL filter (backend/src/modules/discovery/live-offer.util.ts) has no `offerDate = today` condition, only `pickupEndAt > now`, so an offer published today for tomorrow's window is listed and buyable.

**Fix**

En küçük doğru düzeltme metin katmanında: "BUGÜN"ü koşullu hale getir, aksi halde günü yaz.

1. `apps/consumer/src/lib/format.ts` — mevcut `ISTANBUL_TIME_ZONE` ile bir gün anahtarı yardımcısı ekle:
   `export function istanbulGunAnahtari(iso: string | Date): string { const d = typeof iso === "string" ? new Date(iso) : iso; return d.toLocaleDateString("en-CA", { timeZone: ISTANBUL_TIME_ZONE }); }`  // YYYY-MM-DD

2. `apps/consumer/src/i18n/tr.json` (176 ve 247'nin yanına) + `en.json` aynı anahtarlarla (CI locale parity):
   tr: `"aliniyorTarihli": "{{tarih}} {{pencere}} arası al"`, `"arasindaAlTarihli": "{{tarih}} {{pencere}} arası al"`
   en: `"aliniyorTarihli": "Pick up {{tarih}} {{pencere}}"`, `"arasindaAlTarihli": "Pick up {{tarih}} between {{pencere}}"`

3. `apps/consumer/src/app/order/[id].tsx:158` — `simdi` zaten elde (satır 152'de kullanılıyor):
   `const bugunMu = istanbulGunAnahtari(pickupStartAt) === istanbulGunAnahtari(simdi);`
   `{t(bugunMu ? "orders.aliniyor" : "orders.aliniyorTarihli", { pencere: formatPickupWindow(pickupStartAt, pickupEndAt), tarih: trUpper(formatShortDate(pickupStartAt)) })}`
   Tarihi büyütürken mutlaka `src/design/tr-upper`'daki `trUpper()` kullanılmalı — `formatShortDate` "12 Nis"/"3 Eyl" gibi i içeren ay kısaltmaları üretiyor ve `toUpperCase()` "NIS" yazardı.

4. Aynı şekilde `apps/consumer/src/components/teslim/OnayEkrani.tsx:167` — bileşene mevcut `pencere` prop'unun yanına `bugunMu` (ya da `pickupStartAt`) geçirilip `payment.arasindaAl` / `payment.arasindaAlTarihli` seçilmeli; çağıran `app/payment/[id].tsx:96` zaten `benim.pickupStartAt`'e sahip.

(Kapsam dışı ama asıl kök neden: pencere kapandıktan sonra CONFIRMED'ın AKTİF'te canlı "KEPENGİ AÇ" ile durması — orders.tsx'in AKTİF bölümü `pickupEndAt > now` ile daraltılmalı ve/veya backend'e NO_SHOW süpürücüsü gelmeli. Bu ayrı bir bulgudur; yukarıdaki metin düzeltmesi bunu beklemeden doğrudur.)

---

## 13. [HIGH] Discovery header hardcodes the Turkish locative suffix `'de`, so it prints "Beşiktaş'de", "Üsküdar'de", "Beyoğlu'de"

`apps/consumer/src/i18n/tr.json:110` · dimension: dil-ve-metin

**What goes wrong**

`kesif.acikCok` = "{{bolge}}'de {{count}} kepenk hâlâ açık" is rendered at apps/consumer/src/app/(tabs)/index.tsx:117 with `bolge` taken straight from the DB (`baskinBolge()` returns `offer.store.district`). Turkish locative agrees with the last vowel and the last consonant, so only some districts take `'de`. With more than 8 open offers concentrated in Beşiktaş — the exact cross-Bosphorus case index.tsx:63 says the seeded data is built for — the header reads "Beşiktaş'de 11 kepenk hâlâ açık" instead of "Beşiktaş'ta". Üsküdar → "Üsküdar'de" (should be 'da), Beyoğlu → "Beyoğlu'de" ('da), Kartal → "Kartal'de" ('da). This is the app's own stated failure mode: components/teslim/tr-yer.ts:8 says a fixed 'da "gets a third of İstanbul's districts wrong … the single loudest way an app reads as translated rather than written" — and that file already exports the correct `yerBulunma()`, used in exactly one place (redeem).

**Fix**

Soneki metinden çıkar, zaten var olan ve test edilmiş yardımcıyı çağır (yer tutucu adı `bolge` kalır, böylece en.json'da değişiklik gerekmez ve CI locale parity bozulmaz):

1) apps/consumer/src/i18n/tr.json:110
   -  "acikCok": "{{bolge}}'de {{count}} kepenk hâlâ açık",
   +  "acikCok": "{{bolge}} {{count}} kepenk hâlâ açık",

2) apps/consumer/src/app/(tabs)/index.tsx:117
   -      ? t("kesif.acikCok", { bolge: baskinBolgeAdi, count: acikSayisi })
   +      ? t("kesif.acikCok", { bolge: yerBulunma(baskinBolgeAdi), count: acikSayisi })
   ve dosyanın başına: import { yerBulunma } from "../../components/teslim";

en.json:110 ("{{count}} shutters still open in {{bolge}}") olduğu gibi kalır — kepenk.etkiSatiri'nin en.json:534'teki mevcut deseniyle birebir aynı davranış (en zaten lansmanda sevk edilmiyor, i18n/index.ts).

---

## 14. [MEDIUM] The district picker is a `<Modal animationType="slide">` that never asks about reduce motion — a full-height sheet flies up the screen for a user who has turned the OS setting on.

`apps/consumer/src/components/DistrictPicker.tsx:30` · dimension: hareket

**What goes wrong**

A user with a vestibular disorder denies (or has no) location permission, so Keşfet shows the `Konumun kapalı` banner and the header's `◉ KADIKÖY ▾` control — the intended, spec-blessed recovery path (§4.8 LOCATION DENIED, "never a blocking wall"). They tap it and a sheet up to 70% of the screen height slides in from the bottom over ~300ms, and slides back out on every dismissal. The same modal is also mounted on Ara (app/(tabs)/search.tsx:173), so it is reachable from two of the four tabs. `DistrictPicker` imports neither `useReduceMotion` nor anything from `design/motion.ts` — it is the one moving surface in the app that never consults the preference at all, which is precisely the sliding sheet §2's Degradation clause exists to suppress. Suppressing it costs nothing: the sheet's content is identical either way, so the end state carries all of the information.

**Fix**

apps/consumer/src/components/DistrictPicker.tsx — add the hook and make the one prop conditional, following the codebase's `=== false` convention (null means "not yet known", so it must fall to no-motion):

  import { useReduceMotion } from "../design/reduce-motion";
  ...
  export function DistrictPicker({ visible, onSelect, onClose }: DistrictPickerProps) {
    const { t } = useTranslation();
    const palet = usePalet();
    const azaltHareket = useReduceMotion();

    return (
      <Modal
        visible={visible}
        animationType={azaltHareket === false ? "slide" : "none"}
        transparent
        onRequestClose={onClose}
      >

Nothing else changes: the sheet's content, scrim, radius and contact edge are identical in both modes, so the end state carries all the information. Optionally add a one-line grep to design-yasaklar.test.ts asserting no source file passes a literal `animationType="slide"`, so the next Modal cannot reintroduce it.

---

## 15. [MEDIUM] The map zooms itself with a 300ms `animateToRegion` on every cluster tap, with no reduce-motion gate and a hardcoded duration.

`apps/consumer/src/components/MapPane.native.tsx:198` · dimension: hareket

**What goes wrong**

A user with reduce-motion enabled opens the Harita tab (or scrolls the Keşfet header map back up) and taps a cluster pin showing `4`. The whole viewport pans and zooms under them over 300ms. A self-driving full-screen camera move is one of the strongest vestibular triggers in the app, and it is the only motion left in the map surface — `MapPane` deliberately does everything else as a discrete state change (the `tracksViewChanges` re-snapshot rule at lines 63-67), which makes this one animated call the odd one out. The duration `300` is also written inline rather than taken from `m`, so nothing in `design/motion.ts` or the §5 grep test in `__tests__/design-yasaklar.test.ts` can see it.

**Fix**

In apps/consumer/src/components/MapPane.native.tsx, gate the camera move on the existing hook and take the duration from `m` (both natives special-case 0 as an instant, non-animated jump — RNMapsGoogleMapView.mm:63-64 `[_view setRegion:region]`, MapView.java:1396-1398 `map.moveCamera(...)` — so this yields a discrete recentre, not a slowed one):

  import { useReduceMotion } from "../design/reduce-motion";
  import { m, r, yazi, type Palet } from "../design/tokens";   // add `m`

  // inside MapPane(), next to `const palet = usePalet();`
  const azaltHareket = useReduceMotion();

  const handleClusterPress = (clusterId: number, lng: number, lat: number) => {
    const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId), 20);
    const nextDelta = 360 / Math.pow(2, expansionZoom);
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: nextDelta, longitudeDelta: nextDelta },
      // `null` (answer not yet known) counts as "no movement", exactly as
      // in theme.tsx — and m.fast is §1.3's own map token.
      azaltHareket === false ? m.fast : 0,
    );
  };

The gate is the load-bearing half; swapping the inline 300 for `m.fast` (§1.3 "Map pin selection") is what makes the duration visible to design/motion.ts and to a §5 grep test.

---

## 16. [MEDIUM] Kepengin 30 saniyede kendi kendine inmesi ekran okuyucu odağını yok ediyor

`apps/consumer/src/app/redeem/[id].tsx:211` · dimension: ekran-okuyucu

**What goes wrong**

`ACIK_KALMA_SN = 30` (perde.ts:25) ve `if (acik && kalanSn <= 0) indir()` ekran okuyucunun açık olup olmadığına bakmıyor — oysa `ekranOkuyucu` bu ekranda zaten biliniyor (KepenkKolu'na geçiriliyor). TalkBack kullanıcısı kolu tuşlayıp kepengi kaldırıyor; duyuru + saat + tarih + kod + adet + fiyat + sayaç ögelerini tek tek kaydırarak "TESLİM ALDIM"a doğru ilerlerken sayaç sıfırlanıyor, `acildiMs` null oluyor ve `kepenk-acik` alt ağacının tamamı unmount ediliyor. Erişilebilirlik odağı yok oluyor, okuyucu ekranın başına atlıyor. Kullanıcı sırada bekleyen kalabalığın önünde kolu bulup baştan başlamak zorunda ve aynı şey tekrar oluyor.

**Fix**

apps/consumer/src/app/redeem/[id].tsx:210-212 — otomatik inişi ekran okuyucu açıkken devre dışı bırak (kapatma yolları zaten var: "yanlışlıkla açtım" :570 ve geri :399, yani kepenk kalıcı açık kalmıyor; kodun swipe'a kadar hiç mount edilmemesi olan anti-screenshot özelliği de değişmiyor):

  useEffect(() => {
    if (!ekranOkuyucu && acik && kalanSn <= 0) indir();
  }, [acik, ekranOkuyucu, indir, kalanSn]);

Aynı koşulla geri sayım metnini de gizle, yoksa "0 sn sonra kapanır" yalan söyler — :515-521'deki `kepenk-sayac` Text'ini `{!ekranOkuyucu ? (…) : null}` ile sar. Mevcut testler ekran okuyucu kapalı koştuğu için (teslim-kepenk-ekrani.test.tsx:150) yeşil kalır; istenirse ekran okuyucu açıkken 31 sn sonra `kepenk-acik`ın HÂLÂ mount olduğunu doğrulayan bir test eklenir.

---

## 17. [MEDIUM] Sipariş fişinde dükkânın adı hiçbir zaman konuşulmuyor

`apps/consumer/src/app/order/[id].tsx:67` · dimension: ekran-okuyucu

**What goes wrong**

Ekran dükkân adını yalnızca `<Tabela ad={data.storeName} />` ile çiziyor; Tabela.tsx:43 kendi kök View'ını `accessibilityElementsHidden` + `no-hide-descendants` yapıyor. Sayfada storeName'in başka hiçbir metin kopyası yok. Kör kullanıcı Siparişler'den geçmiş bir siparişe dokunup "nereye gidecektim / nereden almıştım" diye baktığında ilçe, paket adı, adet, fiyat, kod ve durum duyar — dükkânın adını duymaz.

**Fix**

apps/consumer/src/app/order/[id].tsx:61 — tabela alanına erişilebilir bir ad ver (tek eleman, yeni metin yok, bu yüzden i18n locale parity etkilenmez; `storeName` veridir ve `hooks/use-order-details.ts:113` zaten `t("orders.unknownStoreName")` fallback'i verdiği için etiket asla boş kalmaz):

<View
  style={styles.tabelaAlani}
  accessible
  accessibilityRole="header"
  accessibilityLabel={data.storeName}
>

(Tabela'nın kendi `accessibilityElementsHidden` davranışı korunur — kart yüzeyi ona bağımlı; burada yalnızca sarmalayıcı konuşan bir eleman haline gelir.)

---

## 18. [MEDIUM] Dükkân profilinde cephe tamamen gizlendiği için sayfanın hangi dükkâna ait olduğu söylenmiyor

`apps/consumer/src/components/Cephe.tsx:73` · dimension: ekran-okuyucu

**What goes wrong**

Cephe'nin kök View'ı `accessibilityElementsHidden` + `no-hide-descendants`; içindeki HeroTabela (dükkân adı) bununla birlikte gizleniyor. store/[id].tsx:127 hero olarak yalnızca bunu kullanıyor ve adı başka hiçbir yerde metin olarak basmıyor. Favorilerden bir dükkâna giren kör kullanıcı sayfayı kaydırdığında sadece "Osmanağa Mah. ..., Kadıköy", puan satırı ve "BUGÜNÜN PAKETLERİ" duyar. Dosyanın kendi yorumu (store/[id].tsx:62-68) "bir dükkân sayfasının her zaman açıkça söylemesi gereken tek şey hangi dükkân olduğudur" diyor; ekran okuyucuda tam da bu söylenmiyor.

**Fix**

store/[id].tsx'te SADECE Cephe'yi saran yeni bir iç View ekle (satır 127 çevresinde): `<View accessible accessibilityRole="header" accessibilityLabel={storeQuery.data.store.name}><Cephe … /></View>`. `accessible` şart — RN'de View varsayılan olarak erişilebilirlik öğesi değildir, yalnız accessibilityLabel vermek iOS'ta duyurulmaz. Ad ham haliyle (trUpper'sız) verilmeli ki okuyucu doğru telaffuz etsin. Bu props'ları 126'daki mevcut ListHeaderComponent View'ına KOYMA: o View adres, puan ve bölüm başlığını da sarıyor; `accessible` yapmak üçünü tek öğeye çökertip metinlerini yutar.

---

## 19. [MEDIUM] Favoriler satırında "Bugün paketi var/yok" rozeti ekran okuyucuya ulaşmıyor

`apps/consumer/src/app/(tabs)/favorites.tsx:40` · dimension: ekran-okuyucu

**What goes wrong**

Pressable'a `accessibilityLabel={item.store.name}` veriliyor; Pressable varsayılan olarak `accessible` olduğu için bu etiket çocukların metnini değiştirir. Böylece ilçe, yıldız/puan ve — asıl önemlisi — `hasLiveOfferToday`'i taşıyan Badge ("Bugün paketi var" / "Bugün paketi yok") hiç okunmaz. 12 favorisi olan kör kullanıcı listeyi baştan sona dinlediğinde 12 dükkân adı duyar ve hangisinde bugün paket olduğunu anlamak için hepsini tek tek açmak zorunda kalır — listenin var olma sebebi tam olarak bu bilgiydi.

**Fix**

favorites.tsx içinde rozet metnini bir kez hesaplayıp satırın etiketine ekleyin — OrderRow.tsx:71'in kalıbının aynısı, yeni i18n anahtarı yok:

  const altSatir = puanli
    ? `${item.store.district} · ★ ${sayi(item.store.avgStars, 1)} · ${t("storeProfile.ratingCount", { count: item.store.ratingCount })}`
    : item.store.district;
  const durumMetni = item.hasLiveOfferToday
    ? t("favorites.hasOfferToday")
    : t("favorites.noOfferToday");

Sonra satır 40'ı
  accessibilityLabel={`${item.store.name}. ${altSatir}. ${durumMetni}`}
yapın; 69-72'deki ikinci Text `{altSatir}`, 77-84'teki Badge ise `label={durumMetni}` kullansın (aynı stringler, ikinci kez hesaplanmasın). İsteğe bağlı olarak OrderRow ile tam simetri için 76'daki `styles.durum` View'ına `accessibilityElementsHidden importantForAccessibility="no-hide-descendants"` eklenebilir; gruplama zaten gizlediği için davranış açısından şart değil, niyeti açık eder.

---

## 20. [MEDIUM] Sokak omurgasının mesafe etiketi 54pt sabit genişlikte; 1,3×'te "10,3 km" sığmıyor ve kesiliyor

`apps/consumer/src/components/kesif/duzen.ts:37` · dimension: yazi-olcegi

**What goes wrong**

SPINE_ETIKET_GENISLIGI = 54 ve yorumu bunun "widest real distance this app prints (10,3 km — 53,2pt)" için milimetrik ölçüldüğünü söylüyor — ama 1×'te. SokakSatiri.tsx:37-42'deki metin `yazi.data` + `maxFontSizeMultiplier={1,3}` + `numberOfLines={1}` ve sütun `width: 54` sabit. Chivo Mono 500'de "10,3 km" 12pt'te 53,2pt, 1,3×'te 69,2pt → 54pt'lik sütunda "10,3 k…" ya da "10,3…" olarak kesiliyor. Tohumlanmış Levent Fırın tam olarak 10.290 m = "10,3 km". Spine'ın tek işi yürüme kararını taşımak; büyük yazıda o sayı okunamaz hale geliyor.

**Fix**

Sütunu etiketin kendi tavanlanmış font ölçeğiyle birlikte büyüt ve aynı değeri karta geri besle — uygulamanın zaten kullandığı PixelRatio.getFontScale() desenini omurgaya da uygula. duzen.ts'te sabit yerine türetilmiş genişlik:

import { PixelRatio } from "react-native";
/** 1×'te ölçülmüş taban: "10,3 km" = 53,2pt (Chivo Mono 0,6em + 0,4 tracking). */
export const SPINE_ETIKET_TABANI = 54;
/** yazi.data'nın kendi maxFontSizeMultiplier'ı — etiket bundan büyümez. */
export const SPINE_ETIKET_TAVANI = 1.3;
export function spineEtiketGenisligi(olcek: number = PixelRatio.getFontScale()): number {
  return Math.ceil(SPINE_ETIKET_TABANI * Math.min(olcek, SPINE_ETIKET_TAVANI));
}

Sonra SPINE_TOPLAM_GENISLIK ve kartGenisligiHesapla() bu fonksiyondan hesaplansın (kart, omurganın aldığı kadarını tam olarak geri versin); SokakSatiri.tsx'te `etiket` ve `spine` genişlikleri StyleSheet.create sabiti yerine render içinde spineEtiketGenisligi() ile verilsin. 390pt telefonda 1,3×'te etiket 71pt, kart 390−78−16 = 296pt → 280pt tabanının üstünde. SokakYukleniyor da aynı SokakSatiri'den geçtiği için yükleniyor/yüklü geometri testi tek kaynaktan karşılaştırmaya devam eder; duzen.test.ts:18-20'deki toBe(54) iddiası spineEtiketGenisligi(1)===54 ve spineEtiketGenisligi(1.3)===71 olarak güncellenir. (Etiketi allowFontScaling={false} ile dondurmak daha küçük bir yama ama spec §1.2'ye aykırı: uygulamanın en küçük tipini, büyük yazıya ihtiyaç duyan kullanıcı için 12pt'te kilitler.)

---

## 21. [MEDIUM] Teslim saatinde `allowFontScaling={false}`: uygulamanın canlılık kanıtı, kullanıcının yazı boyutunu yok sayan tek eleman

`apps/consumer/src/components/teslim/CanliSaat.tsx:58` · dimension: yazi-olcegi

**What goes wrong**

Aynı `<Text>` hem `maxFontSizeMultiplier={yazi.clock.maxFontSizeMultiplier}` (1,6) hem `allowFontScaling={false}` taşıyor; ikincisi kazanıyor, birincisi ölü prop. Spec §1.2 açıkça "`allowFontScaling` stays true everywhere. maxFontSizeMultiplier: … 1.6 on the redeem clock and code" diyor. En büyük yazı adımındaki az gören müşteri kepenk ekranında her satırın büyüdüğünü, sadece 56pt'lik saatin sabit kaldığını görüyor — ekranın "bu bir ekran görüntüsü değil" kanıtı olan eleman. Aynı kalıp TeslimSeli.tsx:92'deki donmuş teslim saatinde de var. Yorumda gerekçe yok, dolayısıyla niyet 1,6 tavanı gibi görünüyor.

**Fix**

İki dosya, iki farklı minimal düzeltme — aynı yamayı ikisine uygulama:

1) apps/consumer/src/components/teslim/CanliSaat.tsx — SADECE 58. satırı sil:
     -        allowFontScaling={false}
   Geriye zaten duran `maxFontSizeMultiplier={yazi.clock.maxFontSizeMultiplier}` (1.6) kalır ve RN'in `allowFontScaling` varsayılanı true olduğu için spec §1.2 kendiliğinden sağlanır. Tek satır, başka değişiklik gerekmez.

2) apps/consumer/src/components/teslim/TeslimSeli.tsx:92 — burada silmek YETMEZ; tavan hiç yok, silmek 56pt saati tavansız bırakır (RN global varsayılanı 0 = sınırsız) ve kaydırılamayan tam ekran seli taşırabilir. Propu değiştir:
     -        <Text style={[yazi.clock, styles.saat]} allowFontScaling={false}>
     +        <Text style={[yazi.clock, styles.saat]} maxFontSizeMultiplier={yazi.clock.maxFontSizeMultiplier}>

İsteğe bağlı ama ucuz kalıcılık: design-yasaklar.test.ts'e §1.2 için tek bir tarama ekle — TUM_KAYNAK içinde `allowFontScaling={false}` geçen dosya listesi `[]` olmalı; tokens.ts:490'ın zaten yazdığı değişmezi ("allowFontScaling itself stays true everywhere") teste çevirir ve bu sapmanın geri gelmesini engeller.

---

## 22. [MEDIUM] The district picker sheet is anchored to the physical bottom edge with no inset, so its last row sits under the system navigation bar.

`apps/consumer/src/components/DistrictPicker.tsx:73` · dimension: dokunma-hedefi

**What goes wrong**

styles.perde is { flex: 1, justifyContent: 'flex-end' } inside a Modal with no SafeAreaView and no bottom padding, and the FlatList at line 49 has no contentContainerStyle paddingBottom. Each row is minHeight 48 (line 90). This sheet is the location-denied fallback: a user with GPS off, standing in the street, taps 'Konumu aç'/district and scrolls the İstanbul list. On Android edge-to-edge the bottom ~48pt is the nav bar drawn over the sheet, so the row resting at the bottom of the scroll is unreachable — tapping it presses Home — and the user has to scroll the list up a notch to select a district that is visibly right there.

**Fix**

DistrictPicker.tsx'te listeye cihazın alt inset'ini ekle (uygulamanın (tabs)/_layout.tsx:35'teki kendi deyimi: `useSafeAreaInsets().bottom`). Sheet yüzeyi fiziksel alta değmeye devam etsin, sadece liste içeriği nav bar'ın üstünde bitsin: 1) `import { useSafeAreaInsets } from "react-native-safe-area-context";` 2) bileşen içinde `const altBosluk = useSafeAreaInsets().bottom;` 3) satır 49'daki FlatList'e `contentContainerStyle={{ paddingBottom: altBosluk }}` ekle. Başka değişiklik gerekmiyor; `navigationBarTranslucent` prop'unu kurcalamaya gerek yok (edge-to-edge bayrağı zaten onu geçersiz kılıyor).

---

## 23. [MEDIUM] The reply composer on a complaint thread is docked to the physical bottom edge with 8pt of padding and no inset.

`apps/consumer/src/app/complaints/[id].tsx:207` · dimension: dokunma-hedefi

**What goes wrong**

styles.yanitSatiri is paddingVertical: s.s2 (8pt) and it is the last child of a KeyboardAvoidingView inside a PanelScreen whose edges are the default ["top","left","right"] — no bottom inset anywhere. The PanelButton inside it is minHeight 48. With the keyboard closed on an Android phone with 3-button navigation, the bottom 48pt is the system bar drawn over the app, so a user replying to a merchant about a bad bag taps 'Gönder' and hits the system Back/Home instead. On iOS the button's lower 26pt is inside the home-indicator strip.

**Fix**

apps/consumer/src/app/complaints/[id].tsx:61 — `<PanelScreen padded={false}>` yerine `<PanelScreen padded={false} edges={["top", "left", "right", "bottom"]}>`. Tek satır; PanelScreen prop'u zaten var ve uygulamanın dibe eylem çakan diğer ekranlarının (redeem/[id].tsx, teslim/*) kullandığı kalıbın aynısı. iOS'ta klavye açılınca çift boşluk oluşmaz: RN'in KeyboardAvoidingView'i ofseti kendi çerçeve dibi ile ekran dibi arasındaki mesafeyi ÇIKARARAK hesaplar, yani safe-area dolgusu eklenmez, soğurulur.

---

## 24. [MEDIUM] The two mandatory pre-contract document links on the purchase screen are 30pt-tall text targets with no hitSlop.

`apps/consumer/src/app/purchase/[offerId].tsx:422` · dimension: dokunma-hedefi

**What goes wrong**

The Pressables at lines 245-274 wrap a bare Text in yazi.bodyStrong (lineHeight 22) with styles.baglanti = { paddingVertical: s.s1 }, giving a 30pt-tall target, no hitSlop, and no minHeight. These are 'Ön Bilgilendirme Formu'nu oku' and 'Mesafeli Satış Sözleşmesi'ni oku' — the documents the consent checkbox immediately below legally requires the user to have read. A user who wants to read the distance-selling contract before ticking the box taps at it one-handed, misses vertically into the 8pt gap between the two links, and nothing happens; the screen gives no feedback that they missed, so it reads as a link that does not work.

**Fix**

styles.baglanti'yi Text'ten Pressable'a taşı ve uygulamanın kendi 44pt tabanını ver — dolgu büyütmek yerine tek stil kuralı: [offerId].tsx:422 `baglanti: { paddingVertical: s.s1 }` → `baglanti: { minHeight: 44, justifyContent: "center" }`; her iki Pressable'da (247-260 ve 261-274) style prop'unu `style={({ pressed }) => [styles.baglanti, pressed ? { opacity: m.pressOpacity } : null]}` yap ve Text'in stilini `[yazi.bodyStrong, { color: palet.sodyumYazi }]`e indir. Böylece hedef 30 → 44pt olur, metin dikeyde ortalanır, Blok'un 8pt boşluğu görsel olarak korunur ve IconButton/PanelChip/StarRating/Baslik ile aynı konvansiyona oturur. (Salt hitSlop={{ top: 7, bottom: 7 }} da düzeltir ama iki bağlantının slop'ları 8pt boşlukta üst üste biner; minHeight belirsizlik bırakmaz.)

---

## 25. [MEDIUM] Map markers are snapshotted once and can never re-snapshot, so tapping a pin produces no visible selection on Android and the pins keep the daylight palette after the app crosses into gece.

`apps/consumer/src/components/MapPane.native.tsx:88` · dimension: performans

**What goes wrong**

`FiyatPini` starts with `izle = true` and flips it in `onLayout` via `setIzle(false)` (line 88) — but `setIzle(false)` is idempotent, so nothing ever sets `izle` back to `true`. On Android a Custom-View `Marker` is a bitmap snapshot that only refreshes while `tracksViewChanges` is true, so once the first layout has fired the chip's bitmap is frozen. Two concrete failures: (1) the user taps a price pin, `selectedStoreId` changes, `secili` flips and the style at lines 92-94 asks for the sodium fill, the dark ink and the 8pt lift — none of it appears, so the two-way pin↔list binding of §4.2 looks broken from the map side even though the list does scroll; (2) at sunset the palette swaps whole (`theme.tsx:83`) and every other surface repaints, but the markers keep their gündüz fill and gündüz ink for the rest of the session, on a map whose `customMapStyle` has already gone dark — dark-on-dark or light-on-dark pins depending on which side of the swap you were on. The component's own doc comment (lines 62-67) states the intended behaviour — "one extra `onLayout` when `secili` flips" — which is precisely what the idempotent setter prevents.

**Fix**

MapPane.native.tsx / FiyatPini: marker ref'ini tutup görünümü belirleyen girdiler değiştiğinde kütüphanenin kendi kaçış kapısı olan `redraw()`'u çağır — `tracksViewChanges={false}` olduğu gibi kalır, sürekli animasyon/flicker geri gelmez, spec §4.2'nin istediği "one-frame re-snapshot" olur:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, PROVIDER_GOOGLE, type MapMarker as MapMarkerRef, type Region } from "react-native-maps";
...
function FiyatPini({ pin, secili, palet, onPress }: {...}) {
  const [izle, setIzle] = useState(true);
  const pinRef = useRef<MapMarkerRef | null>(null);
  // Android'de Custom-View marker bir bitmap anlık görüntüsüdür ve
  // `tracksViewChanges` false iken donar; renk/mürekkep/kalkış değişimi
  // çocuğun layout'unu değiştirmediği için `onLayout` da bir daha ateşlemez.
  // Ayrık durum değişiminde tek kare yeniden çizdir (spec §4.2).
  useEffect(() => {
    pinRef.current?.redraw();
  }, [secili, palet]);
  return (
    <Marker ref={pinRef} ... tracksViewChanges={izle} ...>
```

Aynı `useEffect`'i KumePini'ye de (satır 124 civarı, bağımlılık `[palet]`) ekle — küme çipleri seçim almıyor ama faz değişiminde onlar da donuyor.

Daha küçük ama daha kaba alternatif: satır 249'daki key'i `key={`${pin.storeId}:${secili}:${palet.faz}`}` yapmak. Mevcut izle=true→onLayout→false döngüsünü yeniden çalıştırır, ancak marker'ı haritadan çıkarıp geri eklediği için bir kare göz kırpması üretir; redraw() tercih edilmeli.

---

## 26. [MEDIUM] M1 STILL REAL — the refresh cookie is only Secure when NODE_ENV is exactly "production", and CORS falls back to the four localhost dev origins for every other deployed env including staging

`backend/src/modules/auth/refresh-cookie-transport.util.ts:114` · dimension: acik-bulgular

**What goes wrong**

`staging` is a validated NODE_ENV (env.validation.ts:77-83 VALID_NODE_ENVS includes it) and a real deployment target (ops/docker-compose.staging.yml, api on 0.0.0.0:4760, panels on 4766/4767/4768). A merchant or admin signing in to the staging panel gets a refresh cookie written with `secure: process.env.NODE_ENV === "production"` — i.e. Secure=false — so the long-lived session credential is transmitted in cleartext on any plain-HTTP hop and is readable to anyone on the path. Simultaneously main.ts:50 returns DEV_DEFAULT_CORS_ORIGINS (the four http://localhost:* origins) with credentials:true for any non-production NODE_ENV, and ops/docker-compose.staging.yml declares no CORS_ALLOWED_ORIGINS in its required-variable header, so the real staging panel origins are refused by CORS while localhost is trusted: the tester's browser blocks every XHR and the app looks dead. env.validation.ts has no isDeployedEnv/isLocalEnv helper (grep returns nothing).

**Fix**

Two lines, split by confidence. (A) The CORS half — fix the code to match its own comment at main.ts:33-35. In backend/src/main.ts:49 replace `if (process.env.NODE_ENV !== "production") {` with a local-only test, e.g. `const nodeEnv = process.env.NODE_ENV; if (nodeEnv === "development" || nodeEnv === "test") {` so any deployed env (staging included) with CORS_ALLOWED_ORIGINS unset gets NO CORS at all instead of a credentialed localhost allowlist. Then add CORS_ALLOWED_ORIGINS to ops/docker-compose.staging.yml's required-variable header (lines 19-22), mirroring docker-compose.prod.yml:35, and correct .env.example:12-16 which currently tells the reader the dev fallback covers every non-production env. (B) The cookie half — do NOT hard-code Secure=true for staging; ops/docker-compose.staging.yml terminates no TLS, so that would break staging login. Drive it from an explicit opt-in: in refresh-cookie-transport.util.ts:114, `secure: process.env.REFRESH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production"`, and add REFRESH_COOKIE_SECURE to the staging compose header with a note to set it to true once staging is behind TLS. Both existing specs (auth.controller.transport.spec.ts:231, merchants.controller.transport.spec.ts:100) set NODE_ENV="development" and stay green under both changes; optionally add one case per file asserting secure=false and no-CORS for NODE_ENV="staging" so the coupling can't silently regress.

---

## 27. [MEDIUM] M3 STILL REAL — admin-web throws away the access token its own login returns, so every admin session starts with a guaranteed 401 and depends entirely on the refresh cookie

`apps/admin-web/src/auth/AuthContext.tsx:133` · dimension: acik-bulgular

**What goes wrong**

An admin signs in. `login()` awaits client.auth.adminLogin(...) and uses only `result.user` — result.accessToken is discarded. setStoredAccessToken appears in apps/admin-web/src only at :75 and :151, both `null` clears, and packages/api-client/src/engine.ts fires options.onTokensIssued at exactly one place (:201, inside performRefresh), so adminLogin — a plain engine.request in domains/auth.ts — never populates apps/admin-web/src/api/client.ts:59. The first real request after login therefore goes out with no bearer, 401s, and only then recovers through engine.ts's 401→refresh branch. If the refresh cookie is missing or blocked (see M1/M2 above — a cross-registrable-domain panel origin, or a staging box with the localhost CORS fallback), the admin is bounced straight back to the login screen immediately after a login that visibly succeeded. merchant-web does this correctly at apps/merchant-web/src/auth/AuthContext.tsx:99 and apps/consumer at src/lib/auth-context.tsx — admin-web is the only surface left.

**Fix**

apps/admin-web/src/auth/AuthContext.tsx içinde `login()`'e tek satır ekle — `adminLogin` yanıtındaki access token'ı, kardeş uygulamaların yaptığı gibi, hemen bellekteki depoya yaz (setStoredAccessToken zaten :14'te import edilmiş durumda):

  const login = useCallback(async (email: string, password: string) => {
    const result = await client.auth.adminLogin({ email, password });
    // engine.ts onTokensIssued'ı yalnız performRefresh'ten çağırır (engine.ts:201),
    // düz bir login yanıtı için asla — taze oturumun tek kayıt noktası burası.
    setStoredAccessToken(result.accessToken);
    sessionSettledRef.current = true;
    writeCachedProfile(result.user);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

Başka değişiklik gerekmiyor: logout/handleUnauthorized zaten aynı depoyu null'lıyor ve sayfa yenilemesindeki oturum geri yükleme yolu (mount'taki client.auth.refresh()) onTokensIssued üzerinden aynı değişkeni doldurmaya devam ediyor.

---

## 28. [MEDIUM] Şikayetlerim's empty state says "you can report it from here" and gives no way to do so

`apps/consumer/src/app/complaints/index.tsx:35` · dimension: dil-ve-metin

**What goes wrong**

A user with a problem taps Profil → "Şikayetlerim" and, having filed nothing yet, gets `complaints.emptyTitle` "Henüz şikayetin yok" plus `complaints.emptyBody` "Bir siparişle ilgili sorun yaşarsan buradan bildirebilirsin." — "you can report it FROM HERE". The `PanelEmptyState` is rendered with no `ctaLabel`/`onPressCta`, the `PanelHeader` has only a back arrow, and the screen contains no reference to `/complaint/new` at all (grep count 0). The only path to filing is backing out to Profil and picking the row above it. The copy promises an affordance the screen does not have, on the support path a frustrated user reaches after a bad handover.

**Fix**

apps/consumer/src/app/complaints/index.tsx:35-39'daki PanelEmptyState'e iki satır ekle — yeni i18n anahtarı YOK, dolayısıyla locale parity'e dokunulmaz (router zaten :16'da kapsamda):

        <PanelEmptyState
          icon="chatbubble-ellipses-outline"
          title={t("complaints.emptyTitle")}
          body={t("complaints.emptyBody")}
          ctaLabel={t("profile.complaint")}
          onPressCta={() => router.push("/complaint/new")}
        />

Mevcut "profile.complaint" ("Şikayet / destek" / "Complaint / support") anahtarı yeniden kullanılır ve (tabs)/orders.tsx:78-84 desenini birebir aynalar; metnin "buradan" vaadi böylece doğru olur. (Alternatif olan tr.json+en.json emptyBody'yi "Profil'deki Şikayet / destek bölümünden bildirebilirsin" diye yeniden yazmak iki dosyaya dokunur, ekranı yine çıkmaz sokak bırakır ve daha kötüdür.)

---

## 29. [MEDIUM] The sign-in phone field's accessible name is the format mask "5xx xxx xx xx"

`apps/consumer/src/app/(auth)/phone.tsx:74` · dimension: dil-ve-metin

**What goes wrong**

`<TextField label={t("auth.phone.placeholder")} placeholder={t("auth.phone.placeholder")} etiketGizli />` passes the same key to both. `TextField` (components/TextField.tsx:8) documents `label` as "Always required — it is the field's accessibility name even when it is not drawn" and sets `accessibilityLabel={label}`. So a VoiceOver/TalkBack user on the very first screen of the app focuses the only input and hears "5xx xxx xx xx" spelled out, not "Telefon numaran". There is no i18n key for a phone-field label anywhere in tr.json. (The identical duplication on Search was already fixed; the auth screen was missed.)

**Fix**

apps/consumer/src/app/(auth)/phone.tsx:74 — tek satır, otp.tsx:148'in zaten kullandığı kalıba geçir; yeni i18n anahtarı gerekmez, dolayısıyla tr.json/en.json parity işi de yok:

    label={t("auth.phone.title")}          // "Telefon numaranla devam et"
    placeholder={t("auth.phone.placeholder")}
    etiketGizli

(Daha kısa bir alan adı isteniyorsa alternatif: HER İKİ locale dosyasına auth.phone.label ekle — tr "Telefon numarası", en "Phone number" — ve label={t("auth.phone.label")} yap. Bu da doğru ama bir yerine üç dosyaya dokunur; CI locale parity iki dosyanın da güncellenmesini şart koşar.)

---

## 30. [LOW] The first-load stagger fires regardless of reduce motion, though §2 names "no stagger" alongside "no entry roll".

`apps/consumer/src/components/kesif/use-ilk-yukleme.ts:24` · dimension: hareket

**What goes wrong**

On the first successful discovery load, `useIlkYuklemeKademesi` (called unconditionally at app/(tabs)/index.tsx:121) reveals rows one at a time on a 40ms cadence, up to ten steps. Every card's own shutter roll IS correctly suppressed under reduce motion (Kepenk.tsx:95-99), so a user with the preference on gets the worst combination: shutters that snap silently to position while the rows themselves still pop into the street in sequence over ~400ms. Spec §2 Degradation is explicit — "shutters render at their final position; no entry roll, no stagger" — and this hook takes no reduce-motion input at all, so the second half of that sentence is unenforced. `KADEME_MS = 40` is also a local constant rather than a motion token.

**Fix**

Tek dosya, hook'a reduce-motion girdisini eklemek — `apps/consumer/src/components/kesif/use-ilk-yukleme.ts`. Çağrı yeri `(tabs)/index.tsx:121` DEĞİŞMEZ (imza aynı kalır):

    import { useEffect, useRef, useState } from "react";
    import { useReduceMotion } from "../../design/reduce-motion";
    ...
    export function useIlkYuklemeKademesi(satirSayisi: number, hazir: boolean): number {
      const [gorunenSatir, setGorunenSatir] = useState(0);
      const azaltHareket = useReduceMotion();
      const oynatildi = useRef(false);

      useEffect(() => {
        if (!hazir) return;
        // §2 Degradation: "no entry roll, no stagger". Hareket yalnız
        // AÇIKÇA `false` yanıtıyla başlar; `null` (henüz bilinmiyor) da
        // kademe yok demektir — merdiven süs, satırlar bilgi.
        if (azaltHareket !== false || oynatildi.current) {
          oynatildi.current = true;
          setGorunenSatir(satirSayisi);
          return;
        }
        oynatildi.current = true;
        if (satirSayisi === 0) return;
        ... (mevcut merdiven aynen kalır)
      }, [hazir, satirSayisi, azaltHareket]);

`null` durumunda içeriği BEKLETMEK yerine hepsini göstermek bilinçli: Kepenk `null`'da kapalı kareyi tutabilir (orada bilgi kaybı yok), ama burada beklemek `ilkYukHazir === true` iken `gorunenSatirlar` boş kaldığı için (index.tsx:202'de `bosMu` false olduğundan `BosSokak` da çıkmaz) boş bir liste alanı demek olurdu — erişilebilirlik sorgusu çözülmezse içerik hiç gelmez. "Hareket için açık izin gerekir, içerik için gerekmez" kuralı hem en küçük hem en güvenli olan.

Not: mevcut `src/__tests__/use-ilk-yukleme.test.tsx` merdiven testleri (satır 14-53) artık `beforeEach`'te `erisimAzaltmayiAyarla(false)` kurup `afterEach`'te geri almalı, yoksa jest-expo'nun `AccessibilityInfo` mock'u çözülene kadar `azaltHareket` `null` kalır ve merdiven hiç oynamaz. Ayrıca §2'nin bu yarısını da kilitleyecek yeni bir vaka eklenmeli: `erisimAzaltmayiAyarla(true)` ile `hazir` true olur olmaz `result.current === satirSayisi` (zamanlayıcı ilerletmeden).

---

## 31. [LOW] Teklif detayındaki iki ikincil düğmenin etiketi 1,3×'te kesiliyor

`apps/consumer/src/app/offer/[id].tsx:371` · dimension: yazi-olcegi

**What goes wrong**

`ikiDugme` satırında iki düğme flex:1 ile bölüşüyor: 390pt telefonda her biri 173pt, `Dugme`'nin paddingHorizontal s.s4 düşünce iç genişlik 141pt. `ikincil` varyantın etiketi `yazi.label` (12pt Archivo 500, +0,9 tracking) ve `numberOfLines={1}`, tavan 1,3. "HARİTADA GÖSTER" 1×'te 128pt (sığıyor), 1,3×'te 166pt → 141pt'lik kutuda "HARİTADA GÖS…" oluyor. Kullanıcı hangi düğmenin haritayı açtığını, hangisinin yol tarifi verdiğini etiketten çözemiyor.

**Fix**

Tek satır kopya değişikliği — kutuyu büyütmek yerine etiketi kısalt: `apps/consumer/src/i18n/tr.json:485` → `"haritadaGoster": "HARİTADA"` (ölçüldü: 1×'te 69,1pt, 1,3×'te 87,7pt; en dar durum olan 360dp/1,3× iç genişliği 126pt'ye rahat sığıyor). `en.json:485` anahtarı zaten var, locale parity bozulmuyor; istenirse simetri için `"ON MAP"` yapılabilir ama İngilizce hâlihazırda sığdığı için şart değil. Metinler tr.json'da zaten büyük harfli tutulduğu için (§5.6, textTransform yok) trUpper kuralı da etkilenmiyor. Not: `haritayaGit` aslında haritayı değil `/store/[id]` sayfasını açıyor (`offer/[id].tsx:180-181`) — ayrı bir konu, ama etiketi yeniden yazarken bakılmaya değer.

---

## 32. [LOW] The redeem screen's 'can't lift it?' escape button — the fallback for a user already failing the gesture — is a 38pt target.

`apps/consumer/src/components/teslim/KepenkKolu.tsx:302` · dimension: dokunma-hedefi

**What goes wrong**

styles.yardim is { marginTop: s.s3, paddingVertical: s.s2, paddingHorizontal: s.s4 } around a yazi.bodyStrong label (lineHeight 22), so the target is 38pt tall with no hitSlop. It only appears after YARDIM_ESIGI (2) failed drags — i.e. it is shown exactly to the customer who is standing at a counter, holding the phone up, and has already missed the shutter twice, often because their thumb is imprecise. Making the rescue path a smaller target than the thing that just failed them costs a second and third miss in front of a waiting baker. Note this is the one control on the redeem screen below 44pt: the handle itself is 64pt (perde.ts:21) and 'TESLİM ALDIM' is 56pt.

**Fix**

Tek satır, sıfır layout değişikliği: KepenkKolu.tsx:269-277'deki Pressable'a `hitSlop={6}` ekle (38 → 50pt efektif; iOS 44 ve Android 48 eşiklerinin ikisini de geçer, `styles.yardim`'in marginTop s.s3=12'lik boşluğu içinde kaldığı için kolun dokunma alanıyla çakışmaz):

```tsx
<Pressable
  accessibilityRole="button"
  testID="kepenk-yardim"
  hitSlop={6}
  onPress={onKaldir}
  ...
```
(Alternatif, ama daha kötü: satır 302'de `paddingVertical: s.s2` → `s.s3` — 46pt yapar ve `geriAl` ile eşleşir, fakat grup `TamKepenk.tsx:260`'ta `bottom: 8` ile alttan sabitlendiği için buton belirdiğinde kolun yukarı zıplaması 50pt'den 58pt'ye çıkar. hitSlop hiçbir pikseli oynatmaz.)

---

## 33. [LOW] M24 STILL REAL — the share-link bridge page renders no offer preview and still carries a doc comment claiming the endpoint it needs does not exist

`landing/app/[locale]/o/[id]/page.tsx:14` · dimension: acik-bulgular

**What goes wrong**

Someone shares a bag. The recipient opens the link on desktop, or on a phone without the app, and lands on OfferBridgePage — a generic "open the app" page with no store name, no price, no pickup window (the render at :39-59 uses only the offerBridge i18n strings and the app-store CTAs). generateMetadata at :23-32 builds the same generic title/description, so the og preview in WhatsApp/iMessage carries nothing about the actual bag either — the single highest-leverage moment for a share link is spent on a blank bridge. The stated reason at :14-21 ("There is no public 'get one offer by id' endpoint in the backend today") is false: discovery.controller.ts:38 exposes @Get("offers/:id") and packages/api-client/src/domains/discovery.ts:44 exposes discovery.offer(id) — apps/consumer/src/app/o/[id].tsx:36 already calls it. landing is the only consumer of the bridge that hasn't caught up.

**Fix**

En küçük doğru düzeltme (landing tarafında, URL şekli değişmeden):

1) landing/lib/offer.ts ekle — landing/lib/impact.ts:34-80'deki mevcut kalıbı birebir aynala: `NEXT_PUBLIC_API_BASE_URL` yoksa doğrudan `{ status: "unavailable" }` dön; varsa `createClient({ baseUrl, transport: "cookie", actor: "CONSUMER", getAccessToken: () => null, fetch: (i, init) => fetch(i, { ...init, next: { revalidate: 60 } }) })` ile `client.discovery.offer(id)` çağır, try/catch ile 404/ağ hatasını sessizce `unavailable`a düşür (offer canlı değilse endpoint zaten 404 veriyor).

2) page.tsx:34 OfferBridgePage zaten bir Server Component — `await getOffer(id)` sonucunu al; `status === "ok"` ise mevcut app-store CTA'larının ÜSTÜNE dükkân adı + ilçe, fiyat ve alım penceresini (pickupStartAt–pickupEndAt) bas; değilse bugünkü jenerik köprü aynen kalsın.

3) generateMetadata :23-32 aynı veriyi kullansın: title = dükkân adı içeren başlık, description = fiyat + alım penceresi; veri yoksa bugünkü t("title")/t("body")'ye düş.

4) page.tsx:14-21'deki "There is no public get-one-offer endpoint" paragrafını sil (yerine discovery.controller.ts:38'e atıf yapan bir cümle), landing/README.md:31-33'teki "Known gap" bölümünü de kaldır.

5) Yeni kopya anahtarları hem landing/messages/tr.json hem en.json içinde `offerBridge` altında ayna olsun (locale parity CI'ı bunu zorluyor).

Rider (aynı düzeltmenin parçası değil ama bilinmeli): og kartının facebookexternalhit gibi robots.txt'e uyan crawler'larda görünmesi isteniyorsa landing/app/robots.ts:12'deki `disallow: ["/o/"]` de kaldırılmalı; WhatsApp/Telegram zaten robots'a bakmadan çektiği için sayfa düzeltmesi tek başına insanın tıkladıktan sonra gördüğünü düzeltir.

---


## Refuted — do not raise these again

- **(hareket) The redeem screen subscribes the 1Hz rail at its root, so the full-bleed SVG shopfront re-renders 60 times a minute in the two states that display nothing at second resolution — with keep-awake on and brightness pinned to 1.0.**
  - İddianın mekaniği doğru, anlattığı zarar değil; üç ayrı yerde koda çarpıp dağılıyor.

1) Olgusal hata — "iki durumda da tam-ekran SVG vitrin 60 kez yeniden çiziliyor". Başarı dalında vitrin YOK. `redeem/[id].tsx:293-378` erken dönüşü sadece `HeroTabela` + dört `Text` + iki `Dugme` + `TeslimSeli` basıyor; `TamKepenk` de `AcikDukkan` da o ağaçta hiç mount edilmiyor (grep: 293-378 aralığında yalnız HeroTabela/TeslimSeli var). Yani iddianın merkezi maliyet argümanı — "TamKepenk.tsx:82-94'teki iki `interpolate()` + `Animated.add()` sıfırdan kuruluyor" — iki durumdan yalnız birinde, Durum A'da geçerli.

2) Durum A'da 1 Hz rayı boş değil, bir KAPIYI besliyor. `perde.ts:186-188` `pencereDurumu` sıkı karşılaştırma (`simdiMs < baslangicMs` / `> bitisMs`); çıktısı `[id].tsx:380`'de `kilitli`ye, oradan `TamKepenk`in asma kilidine ve `KepenkKolu`nun dirençli sürüklemesine gidiyor. Dakika kovasına (`dakikaKovasi` = tabana yuvarlama) düşürülürse alım penceresi kapandıktan sonra kepenk 59 saniyeye kadar kilitlenmeden kalır — yani "saniye çözünürlüğünde hiçbir şey göstermiyor" doğru ama "saniye çözünürlüğünde hiçbir şeye ihtiyacı yok" yanlış. Spec'in yazılı kuralı da (satır 555: "opt-in `secondTick` (1Hz, mounted only by redeem)") ihlal edilmiyor; "yalnız kepenk açıkken" diye bir kural spec'te yok, o iddia sahibinin çıkarımı.

3) "Sürükleme ortasında parmağın sürdüğü interpolation düğümleri sökülüyor" — kullanıcıya yansıyan bir sonucu yok. `KepenkKolu.tsx:80-124` PanResponder'ı `useMemo` ile sarılı ve bağımlılıkları (`basiliTut, ekranOkuyucu, kilitli, konum, onKaldir, onKilitliDeneme, yukseklik`) tik başına değişmiyor → jest hiç sıfırlanmıyor; `konum` bir `useRef` Animated.Value (`[id].tsx:133`) → değer korunuyor; RN 0.86.2'de `createAnimatedPropsHook.js`'in `reduceAnimatedProps`'u her render'da `__getValueWithStaticProps` ile GÜNCEL animasyon değerini commit ediyor ve yeni `AnimatedProps` `__attach` edildikten sonra eskisi microtask'ta düşürülüyor. Yeni düğüm kurulması gerçek, görünür sıçrama değil.

4) Pil argümanı kendi kendini yiyor: `useTezgahModu(true)` ekranı 1.0 parlaklıkta tutuyor (`parlaklik.ts:30-39`). Yürüyüş boyunca ~1 W'lık ekranın yanında, ~100 elemanlık bir ağacın saniyede bir reconcile edilmesi (yerli mutasyon üretmiyor, çünkü prop'lar özdeş) ölçülebilir bir maliyet değil. "Hangi kullanıcı, ne yaparken, neyi yanlış görüyor" sorusunun cevabı yok → rapor kuralına göre bulgu değil.

NOT — bu yolda GERÇEK olan tek kusur başka bir dosyada ve iddia sahibinin kendi deyimiyle "yukarıdaki flood bug"a ait: `[id].tsx:373`'teki satır-içi `onBitti={() => setSelBitti(true)}` her render'da yeni kimlik alıyor ve `TeslimSeli.tsx:71`'de effect bağımlılığı; her yeniden render `dizi.stop()` + yeniden başlat yapıyor, floodIn 400 + floodHold 2200 = 2600 ms > 1000 ms olduğu için dizi asla bitmiyor, `onBitti` hiç çağrılmıyor, altın sel kalıcı kalıyor. Doğru düzeltmesi kararlı bir `useCallback` (ya da bağımlılığın `useRef` ile sabitlenmesi) — 1 Hz rayını taşımak değil; ray kaldırılsa bile `etki` sorgusunun cevabı flood penceresine düştüğünde aynı effect yeniden tetikleniyor. Bu ayrı bulgu olarak izlenmeli; bu iddiayı gerçek yapmıyor.

- **(hareket) CanliSaat renders the sweeping nabız bar while reduce motion is still unknown, contradicting the contract reduce-motion.ts documents for every consumer.**
  - The quoted branch is real (CanliSaat.tsx:62, sweep armed at 85-97), but no user can reach it with `azaltHareket === null`, and the "seven consumers" premise is a misreading.

MOUNT GATE: CanliSaat's only production caller is redeem/[id].tsx:468, inside `{acik ? (...)}` (line 466). `acik = acildiMs !== null` (line 202) and `acildiMs` is set in exactly one place — `setAcildiMs(t0)` at line 170, inside `kaldir()`, the shutter-release handler. Ahead of that the screen returns a loading DurumEkrani (line 256, `if (isLoading || !queueChecked)`). `useReduceMotion()` is subscribed at line 99 on the screen's first render, so its promise settles an async query and a full human gesture before CanliSaat ever mounts. The exposure is not "a frame or two" — it is zero frames.

THE REDUCE-MOTION PATH IS GATED ON THE ANSWER ITSELF: KepenkKolu.tsx:78 `const basiliTut = azaltHareket === true;` with the comment above it stating the convention deliberately ("until it is, the drag is the safe assumption … the press-and-hold takes over the moment the platform answers `true`"). The press-and-hold handle a reduce-motion user needs only exists once the answer is `true`, so on that path CanliSaat's first frame is already the ring. teslim-kepenk-ekrani.test.tsx:200-222 pins it: press-and-hold → kepenk-acik → `kepenk-nabiz-halkasi` present, `kepenk-nabiz` null. The listener only ever writes booleans, so null is never re-entered mid-session.

CONTRACT MISREAD: reduce-motion.ts:17-18 scopes the rule to "the entry roll" — one-shot, unrepeatable entries. Those consumers do guard (Kepenk.tsx:92, OnayEkrani.tsx:72, theme.tsx:72, KapandiEkrani.tsx:62 — not 294 as claimed, StokCipi.tsx:32, ZamanHapi.tsx:59). But `=== true` is a second documented family, not a lone exception: KepenkKolu.tsx:78, TeslimSeli.tsx:44, and the redeem screen's own indir()/kaldir() at lines 148 and 188 all use it. The nabız is a continuous 1Hz rail re-armed each tick off `ms`, not an entry roll; when the answer lands it swaps on the next render with nothing left running.

TOKENS: `m` (tokens.ts:460-474) has no 1000ms token, and the duration must be 1000 to stay phase-locked to the seconds digit, which is the trained tell. `egri.flood` is literally `Easing.out(Easing.cubic)` (motion.ts:22), so the value is identical and borrowing the handover-flood name for a clock rail would read worse. Not recorded in review-notes-tam-gezinti.md either way; the mount gate is what defeats it.

- **(hareket) The sold-out-at-checkout flash runs on durations and easings that exist nowhere in the motion tokens, so the motion budget cannot be audited from `design/motion.ts`.**
  - The claim rests on a false premise about which file holds the budget, and its stated consequence is factually wrong at four of the six sites it cites.

1. WRONG FILE. `design/motion.ts` never held durations and was never meant to. Its own header says "Motion curves for the duration tokens in tokens.ts (spec §1.3)", and `docs/design/build-log-foundation.md:26` describes it as "The easing curves for the duration tokens". The durations are `m` in `design/tokens.ts:460` (`fast:150, base:220, snap:180, roll:700, floodIn/Hold/Out, phase:600, hapFlip:300, stokNefes:2400`). "The motion budget cannot be audited from design/motion.ts" is auditing the wrong file.

2. THE STATED CONSEQUENCE IS FALSE AT 4/6 SITES. "A change to `m` silently leaves six surfaces on their old timings" does not hold:
   - `KepenkKolu.tsx:101` and `:109` — `duration: m.fast` (the claim quotes only the adjacent `easing:` lines 102/110 and skips the duration line directly above each).
   - `Kepenk.tsx:138`/`:144` and `StokCipi.tsx:41`/`:47` — `duration: m.stokNefes / 2`.
   All four track `m` today. Only the easing function is written inline, and `Easing.inOut(Easing.quad)` (the ≤2-left breath) exists in no `egri` key at all — there is nothing to import, so "re-typed rather than imported" is wrong there. `KepenkKolu.tsx:143`'s `Easing.linear` drives the hold-progress fill; naming it `egri.phase` (documented as "day↔night palette cross-fade overlay") would attach a false label, and linear is the only honest curve for a progress fill.

3. THE THREE LOCAL CONSTANTS ARE THE SPEC'S OWN LITERAL NUMBERS, NAMED AND CITED — that is the audit trail, not drift: `CARPMA_SURESI = 240` (`perde.ts:34`) ← spec §4.4 "slams down over 240ms"; `FIS_SURESI = 320` (`OnayEkrani.tsx:23`) ← §4.4 "slides down over 320ms"; `BASILI_TUT_SURESI = 600` (`KepenkKolu.tsx:26`) ← §2 Degradation / §4.5 "600ms press-and-hold". Each is a named constant whose doc comment quotes the spec clause it implements.

4. THE ONLY GENUINELY UNTOKENED NUMBERS ARE 90/260, AND THE SPEC LEFT THEM OPEN. `KapandiEkrani.tsx:76` `duration: 90` / `:82` `duration: 260` are real, but §4.4 specifies only "the tente-red flash" with no timing, and §1.3's table is a list of named *reusable* motions, not a whitelist — the spec itself hands out one-off durations in §4.4 (240, 320) and §4.5 (600). Choosing 90 in / 260 out is inside the space the spec left, not a violation of it.

5. NOTHING IN §5 TO TEST AGAINST. `__tests__/design-yasaklar.test.ts` implements §5.1–§5.15; §5 contains no "every duration must come from `m`" rule, so the test is not missing a check the spec states. There is also no lint rule imposing one (`eslint.config.js` has nothing on durations). The claim invents a contract and then reports its absence.

6. NO USER FAILURE. The whole sequence is correctly gated: `KapandiEkrani.tsx:62-65` returns before `.start()` when `azaltHareket !== false`, so a reduce-motion user sees no flash at all, and everyone else sees exactly the §4.4 flash over the 34% perde band while the shutter slams. There is no user, doing anything, who sees anything wrong. The asserted harm is entirely maintainability-hypothetical, and per point 2 it is not even true.

7. The causal tail — "which is how the two ungated animations got through unnoticed" — does not follow: a duration-source grep would not catch an ungated animation; only a reduce-motion gate check would. Those are separate findings and stand or fall on their own.

Not listed in `review-notes-tam-gezinti.md` either way, but points 1, 2, 5 and 6 defeat it independently.

- **(ekran-okuyucu) Teklif detayında dükkânın adı çiziliyor ama hiçbir zaman konuşulmuyor**
  - MEKANİK İDDİA DOĞRU, ANLATILAN ZARAR YANLIŞ — bulgunun bedelini taşıyan cümle kodla çürüyor.

1) Kod gerçekten iddia edileni yapıyor mu? Kısmen evet. DetayBasligi.tsx:134-138 tabela plakasını saran View'a `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` koyuyor, içindeki 28pt `{yazit}` (=`trUpper(dukkanAdi)`, satır 76/162) erişilebilirlik ağacında yok. Kepenk.tsx:165-166 ve Tente.tsx:30-31 de gizli. Dış View'da (satır 81) telafi eden `accessibilityLabel` yok, offer/[id].tsx'te `dukkan.name` hiçbir Text'e basılmıyor (`meta` satır 245-249 yalnız "kategori · ilçe, il"), _layout.tsx `headerShown:false`.

2) Başka yer hallediyor mu? EVET — asıl önemli yerde. `KUTUYU AYIR` butonu (offer/[id].tsx:431-436) her zaman `/purchase/[offerId]`'e gidiyor ve o ekranın ScrollView'ındaki İLK içerik öğesi düz, gizlenmemiş bir Text: `apps/consumer/src/app/purchase/[offerId].tsx:194` → `{trUpper(dukkanSorgusu.data?.store.name ?? "")}`. O dosyada hiçbir `accessibilityElementsHidden` yok (yalnız 281 ve 364'te accessibilityLabel var). Yani kullanıcı adedi seçmeden, onay kutusunu işaretlemeden ve ödeme butonuna basmadan ÖNCE dükkânın adını duyuyor. Ödeme onay ekranı da adı taşıyor (payment/[id].tsx:91 `dukkanAdi={detay.data?.storeName}`), sipariş detayı da (order/[id].tsx:70).

3) Gerçek kullanıcı iddia edilen yolda bunu yaşar mı? Anlatılan sonucu yaşamaz. "Parayı isimsiz bir dükkâna öder" — para yolunun üzerinde adı söyleyen bir ekran var (purchase:194). Dahası detay ekranı kör kullanıcıya dükkânı zaten tanımlıyor: `meta` ile "Fırın · Yeldeğirmeni, Kadıköy" ve satır 366'da `{dukkan.address}` — açık adres tam olarak okunuyor. Yani "hangi dükkândan aldığını asla bilmez" de doğru değil; eksik olan tek şey ticari unvan, o da bir dokunuş sonra, para hareket etmeden duyuluyor.

4) Notlarda kayıtlı mı? review-notes-tam-gezinti.md'de ekran-okuyucu/erişilebilirlik hiç geçmiyor; ne verified-good ne false-alarm. Bu madde iddiayı çürütmüyor, ama 2 ve 3 çürütüyor.

Ek bağlam (yanıltıcı olmasın diye): geriye kalan küçük gerçek şu — VitrinKarti.tsx:253-257'deki açık doktrin ("dekoratif olan her şey gizlenir, TEK birleşik etiket tüm teklifi söyler; `vitrin.erisim` şablonu `{{dukkan}}` ile BAŞLAR") detay ekranında karşılıksız kalmış: kart tek dokunma hedefi olduğu için telafisi var, detay sayfası parça parça gezildiği için yok. İstenirse en küçük düzeltme DetayBasligi.tsx:134-138'deki gizleme çiftini kaldırmak değil (28pt caps plaka + civata düğümleri gürültü yapar), o View'a `accessible accessibilityRole="text" accessibilityLabel={dukkanAdi}` (trUpper'sız, ham ad) eklemek olurdu — yeni i18n anahtarı gerektirmez, locale parity'yi bozmaz. Ama bu "iyileştirme" seviyesinde; filed edilen bulgunun somut zararı (isimsiz dükkâna ödeme) kodla yanlışlanıyor, dolayısıyla bulgu bu haliyle gerçek değil.

- **(ekran-okuyucu) Teslim kodu ekran okuyucudan gizli — sadece tek seferlik bir duyuru var, talep üzerine tekrar okunamıyor**
  - İddianın taşıyıcı önermesi ("duyuruyu kaçıran kör kullanıcı heceli kodu bir daha ASLA alamaz") kodla çürüyor.

DOĞRU OLAN KISIM: Kod.tsx:31-32 gerçekten tüm bloğu `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` ile gizliyor ve `kodHeceleme()` yalnızca redeem/[id].tsx:250'de çağrılıyor.

ÇÜRÜTEN KISIM — duyuru tek seferlik DEĞİL, mandalı her kapanışta sıfırlanıyor:
• redeem/[id].tsx:241-242: `if (!acik || !data) { if (!acik) duyuruldu.current = false;` → kepenk her kapandığında latch sıfırlanır, yani her yeniden açılışta heceli duyuru (`K, 7, F, 3, M`) yeniden çalar.
• redeem/[id].tsx:211: `if (acik && kalanSn <= 0) indir();` ve indir() içindeki `setAcildiMs(null)` (:146) — kepenk 30 sn sonra KENDİLİĞİNDEN iniyor. Kullanıcının hiçbir şey yapması gerekmez; en kötü ihtimalle ≤30 sn bekler ve düğmeye basar.
• redeem/[id].tsx:573: `kepenk-yanlislikla` Pressable (accessibilityRole="button") kepenk açıkken ekranda duruyor → anında kapat-aç.
• KepenkKolu.tsx:220-227: ekran okuyucu açıkken sürükleme yerine düz bir buton geliyor ve erişilebilir etiketi `kepenk.kolErisim` = "Kepengi kaldır — kodu göster". Yani tekrar-dinleme kontrolünün adı doğrudan "kodu göster".

TESTLE ÇİVİLENMİŞ: src/__tests__/teslim-kepenk-ekrani.test.tsx:130-168, "Kepenk — it is never one-shot" describe'ı; biri `kepenk-yanlislikla` ile kapatıp yeniden kaldırıyor, diğeri 31_000 ms ilerletip `kepenk-acik`in gittiğini ve yeniden açılabildiğini doğruluyor. Ekran başlığındaki yorum da (redeem/[id].tsx:85-87) kuralı açıkça yazıyor: "It is never one-shot… re-swipe as many times as needed."

İddia "tek çare kepengi kapatıp yeniden kaldırmak" diyerek çözümü zaten kabul ediyor; ancak bu bir workaround değil, uygulamanın birincil, testli ve erişilebilir etiketli tekrar mekanizması — gören kullanıcının teslim sırasında kepenk indiğinde kullandığı yolun aynısı. Gerçek maliyet "asla" değil, en fazla 30 sn veya tek dokunuş.

Kalan gerçek riskler iddiadan çok daha küçük: iOS'ta aynı karede mount olan alt ağacın duyuruyu yutması olası ama tek dokunuşla telafi ediliyor; `#K-7F3M` bilet satırı (redeem/[id].tsx:507-512) tek kaynak değil, yedek. docs/design/review-notes-tam-gezinti.md redeem erişilebilirliğine hiç değinmiyor (madde 4 ne kurtarıyor ne batırıyor); bulguyu madde 2 batırıyor.

- **(yazi-olcegi) Sekme çubuğunun sabit 70pt yüksekliği yazı ölçeğini hiç sormuyor; Android'de büyük yazıda "Keşfet/Siparişler" tekrar ş/ğ kuyruğunu kaybediyor**
  - İddianın ölçüleri büyük ölçüde doğru ama sonucu yanlış: hem "Türkçe kuyruğu kaybolur" mekanizması hem de "kesilir" mekanizması kodda çürüyor.

1) Kod gerçekten iddia edildiği gibi mi? Kısmen evet. apps/consumer/src/app/(tabs)/_layout.tsx:29 `SEKME_YUKSEKLIGI = 70`; :69-71 `height: 70 + altBosluk`, `paddingTop: 8` (s.s2, tokens.ts:431), `paddingBottom: altBosluk + 8` → içerik kutusu tam 54pt (iddia doğru). Etikete `tabBarAllowFontScaling` verilmiyor; expo-router'ın vendor'ladığı navigator'da varsayılan `allowFontScaling = SUPPORTS_LARGE_CONTENT_VIEWER ? false : undefined` (apps/consumer/node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabItem.js:17) → iOS 13+'ta ZATEN kapalı, Android'de açık. İkon kutusu sabit 28pt (TabBarIcon.js:62-65 wrapperUikit height = ICON_SIZE_TALL) ve öğe padding'i 5 (BottomTabItem.js `tabVerticalUiKit`). Buraya kadar iddia doğru.

2) Ama "kuyruk kaybı" iddiasının dayandığı varsayım yanlış: Android'de mutlak lineHeight de fontSize ile AYNI SP dönüşümünden geçiyor — react-native/ReactAndroid/.../views/text/TextAttributes.kt `effectiveLineHeight`: `if (allowFontScaling) PixelUtil.toPixelFromSP(lineHeight, ...)`, `effectiveFontSize` de aynı şekilde. Yani 17/11 = 1,545 satır-kutusu oranı her ölçekte SABİT kalıyor; ş/ğ/ç kuyruğu satır kutusunun İÇİNDE kaldığı için, düzeltilen orijinal hatanın (kutu glif için küçük) büyük yazıda geri gelmesi diye bir şey yok. Kutu büyüyor, glif de aynı oranda büyüyor.

3) "Kesiliyor" da olmuyor: RN Android çocukları kırpmıyor — ReactViewGroup.kt:172 `clipChildren = false` ve `_overflow = Overflow.VISIBLE`; ayrıca öğe sarmalayıcısı açıkça `overflow: 'visible'` (BottomTabItem.js:96). Dolayısıyla taşan etiket 54pt'lik öğe kutusu veya çubuk kutusu tarafından değil, yalnızca fiziksel ekran kenarı tarafından kesilebilir. Gerçek pay: etiket satır kutusunun tepesi çubuk üstünden 8+5+28 = 41pt aşağıda; çubuk dibi 70+inset. Yani güvenli koşul 17f ≤ 29+inset:
   - inset = 0 → f ≤ 1,70
   - inset = 24 (jest çubuğu) → f ≤ 3,11
   - inset = 48 (3 tuş) → f ≤ 4,5
İddianın kendi senaryosu olan 1,3×'te inset 0 olsa bile 6,9pt pay var; 1,5×'te 3,5pt. Android'in kullanıcıya sunduğu azami ölçek 2,0 (Android 14) ve Expo SDK 57 Android'de edge-to-edge zorunlu olduğu için portre modda alt inset asla 0 değil (jest 24, tuşlar 48) — 2,0×'te bile 34 ≤ 29+24 = 53, kesilme yok. "Alt inset'i 0 raporlayan cihaz" portre-kilitli (app.json `"orientation": "portrait"`) edge-to-edge bir Android telefonda pratikte yok.

4) Kalan tek etki, ≥1,3×'te etiketin çubuğun alt dolgusuna 6-20pt sarkması, yani metnin çubuk dibine yaklaşması — çubuğun zemini orada da boyandığı için okunurluk kaybı yok, en fazla 2,0×'te jest tutamacı bölgesiyle ~5pt görsel yakınlık. Bu "iyileştirilebilir", bildirilebilir bir kusur değil. review-notes-tam-gezinti.md §B5 sekme çubuğu düzeltmesini doğrulanmış sayıyor; bu iddia onu geçersiz kılan yeni bir koşul getirmiyor.

Not: istenirse sertleştirme, kartların zaten kullandığı desenle (PixelRatio.getFontScale() ≥ kart.buyumeEsigi, VitrinKarti.tsx:80 / KapaliKart.tsx:27) çubuğun da büyütülmesi olurdu; ama bugün kullanıcıya yansıyan bir hata yok.

- **(yazi-olcegi) Keşfet başlığındaki ilçe adı tavansız `yazi.title` ve satır sabit 52pt: iOS erişilebilirlik boyutlarında başlığı taşırıyor**
  - İddianın taşıyıcı çıkarımı yanlış. "Yanındaki saatte tavan var, demek ki bilinçli konuldu ve bu metin atlandı" doğru değil: Baslik.tsx:47'deki 1,3 çağrı-yerine özgü bir karar değil, `yazi.data` token'ının kendi değerinin tekrarı (tokens.ts:557-563; stil nesnesi Text prop'u taşıyamadığı için her çağrı yeri değeri yeniden yazar). Token tablosu spec §1.2 satır 115 ile birebir örtüşüyor — "1.4 on the tabela, 1.3 on the time pill and stock chip, 1.6 on the redeem clock and code" → tabelaXl/tabelaLg 1.4, data/cipAlarm 1.3, clock/code 1.6, sticker 1.2 — ve aynı cümle "allowFontScaling stays true everywhere" diye başlıyor. `yazi.title` (tokens.ts:535-540) tavanı BİLEREK taşımıyor; uygulamadaki 28 `yazi.title` kullanımının 24'ünde tavan yok. Yani önerilen düzeltme (başlığa tavan koymak) spec'in yasakladığı şey: az gören kullanıcının ilçe adını büyümekten alıkoyan bir erişilebilirlik gerilemesi. Ayrıca tarif edilen arıza da yanlış: 22pt satır kutusunun 52pt'i aşması için çarpanın 2,36 olması gerekir — erişilebilirlik-dışı en büyük boy XXXL (1,353 → 29,8pt), AX1 (39,3pt) ve AX2 (47,1pt) hâlâ sığıyor; taşma ancak AX3'te başlıyor, AX5'e özgü değil. AX3+'ta da taşan kısım haritanın ÜSTÜNE binmiyor: HaritaMini kardeş ağaçta sonra geliyor ((tabs)/index.tsx:220), dolayısıyla RN onu üste boyuyor — semptomun yönü ters. Ve o rejimde ekranın geri kalan sabit geometrisi (kart 196/232, CiplerBar 36pt, BOLUM_SATIR_YUKSEKLIGI 48, 83pt tab bar) zaten zarfın dışında; aynı ekrandaki BosSokak.tsx'in dört tavansız Text'i iddiada hiç geçmiyor. 52pt yüksekliğin kendisi de spec §4.1 mock'unun verdiği sayı. Global bir clamp yok (Text.defaultProps yok, Screen.tsx clamp'lemiyor, pinleyen test yok) — ama bu bir gözden kaçma değil, spec'in açıkça yazdığı politika. review-notes-tam-gezinti.md'de ne verified-good ne de false-alarm olarak kayıtlı; en yakın madde (§B.5 tab bar'ın çengelli harfleri kırpması) başka bir bileşen ve zaten düzeltilmiş.

- **(dokunma-hedefi) Map markers are 28pt and 36pt tall touch targets and, being react-native-maps Markers, cannot take hitSlop.**
  - The measurements are real; the failure story is not. Three independent things kill it.

1) THE GEOMETRY IS SPEC-MANDATED, VERBATIM. `docs/design/consumer-app-spec.md:354` — "**Markers are price chips**, 56 × 28, `bg.derin` fill, 1pt zinc border, `data` 12 ivory: `69₺`. Selected: `accent.sodyum` fill, `#12181F` ink, lifted 8pt." `MapPane.native.tsx:262-270` (`pin: { minWidth: 56, height: 28 }`) implements that literally, and the code comment at :58-60 quotes the line. The spec is binding for this audit and contains NO 44pt touch-target rule anywhere — I grepped the whole 50KB file for `44` / "touch target" / "hit target" / "hitSlop"; the only hits are the `code` type ramp (44/48/+6) and a contrast ratio. The claim measures the app against a floor the design language never adopted, and reports a dimension the spec dictates.

2) THE PIN TAP IS NOT ON ANY TASK PATH — "the only way to select a shop" is false in the way that matters. On the Harita tab, `src/app/(tabs)/harita.tsx:100` wires `onPinPress={setSeciliPin}`. That is the whole effect: it re-styles the pin (sodium fill, `marginBottom: 8`) and highlights a matching bottom-sheet row via `secili={offer.store.id === seciliPin?.storeId}` (harita.tsx:135). It does not navigate, does not open a callout, does not commit anything. The route to an offer on that screen is the bottom sheet's `HaritaSatiri` rows, which `HaritaSatiri.tsx:87` fixes at `satir: { height: 72 }` — 72pt full-width, comfortably over any floor — and whose `onPress` is the `router.push({ pathname: "/offer/[id]" })` at harita.tsx:137-146. `src/__tests__/harita-screen.test.tsx` pins that sheet as the functional surface. On Keşfet the pin does even less: `src/app/(tabs)/index.tsx:176-184` `handlePinPress` only `scrollToIndex`es the list to the matching card — exactly the spec's "tapping a pin scrolls the list beneath to that index... **and vice versa**" (spec:358), i.e. an aid to a two-way binding whose other direction (`handleCardPress`, index.tsx:186-200, sets `seciliPin`) is a full-width card. A user who never once hits a pin can still find, open and buy every offer.

3) THE ESCALATION IS TECHNICALLY WRONG. "moves the region, refires the bbox query and re-clusters, so the chip they were aiming at may not even be in the same place." Clustering is keyed on zoom, and `zoomFromRegion` (MapPane.native.tsx:16-19) derives zoom from `latitudeDelta` alone — `Math.max(0, Math.min(20, Math.round(Math.log2(360 / region.latitudeDelta))))`. A pan does not change `latitudeDelta`, so the rounded zoom is bit-identical and `index.getClusters` (:179) returns the same buckets; only the bbox window shifts. And an 8pt drag moves the chip 8pt on screen together with the finger — it stays in the same place relative to every other pin. So the described cost is one 8pt re-aim, with no state lost, no query result changed, and a 72pt alternative sitting directly below the map.

The 36×36 cluster pin (:271-279) is the only marker whose tap does real work (`handleClusterPress` → `animateToRegion`, :195-207), and it is a 36pt circle at 82% of the cited floor whose function — zooming in — is also reachable by pinch. Spec doesn't specify cluster geometry at all; that is an implementation addition, not a violated contract.

On point 4: `docs/design/review-notes-tam-gezinti.md` neither blesses nor false-alarms this. It cannot — that walk ran against `expo export -p web`, where Metro resolves `MapPane.web.tsx` (an honest closed-shutter placeholder, `MapPane.web.tsx:25-51`) and `.native.tsx` is never bundled. The reviewer never saw a marker. So the notes don't defeat the claim; points 1-3 do.

What is left after the refutation is "a 28pt-tall decorative cross-highlight affordance could be easier to hit" — which is the "could be improved" the brief excludes, and which cannot be acted on anyway without contradicting spec:354.

- **(performans) The discovery list is virtualised in name only — the whole 40-offer page stays mounted, because no FlatList window props are set anywhere in the app.**
  - İddianın ÖLÇÜM kısmı doğru, TEŞHİS kısmı değil — anlattığı kullanıcı hatası o yolda yaşanmıyor.

1) Kod gerçekten öyle mi? Kısmen evet. `apps/consumer/src/app/(tabs)/index.tsx:279-306` içindeki `Animated.FlatList` yalnız `data / keyExtractor / onScroll / contentContainerStyle / getItemLayout / renderItem / refreshControl` veriyor; `src` altında `windowSize|initialNumToRender|maxToRenderPerBatch|removeClippedSubviews` grep'i sıfır sonuç. RN 0.86.2 varsayılanları da iddia edildiği gibi: `apps/consumer/node_modules/@react-native/virtualized-lists/Lists/VirtualizedListProps.js:333` `windowSize ?? 21`. Buraya kadar tamam.

2) Başka bir yerde zaten karşılanıyor mu? Evet, üç yerde ve tam da iddianın maliyet hikâyesini çürüten yerlerde:
   • AYNI dosyadaki varsayılan `initialNumToRenderOrDefault → 10` (aynı props dosyası, satır 303-308) ve `maxToRenderPerBatch ?? 10` / `updateCellsBatchingPeriod ?? 50` (`VirtualizedList.js:1807`). Yani "Keşfet açılır açılmaz 40 kart monte edilir" YANLIŞ: ilk boyamada 10 hücre monte edilir, kalan 30 ekran zaten etkileşimli ve kaydırılabilir hâldeyken 50 ms'lik düşük öncelikli partiler hâlinde gelir. İddianın tarif ettiği "ilk paint'te 2.000 view" duraklaması bu yolda oluşmuyor.
   • Liste ÜST SINIRI sabit: `index.tsx:94` `pageSize: 40` ve `src` genelinde `onEndReached` / `useInfiniteQuery` / `fetchNextPage` hiç yok. Liste hiçbir koşulda 40 teklif satırı + birkaç bölüm başlığını geçemez. FlashList'in çözdüğü problem (sınırsız büyüyen liste) burada mevcut değil; 40 sabit yükseklikli hücre RN'in varsayılan penceresinin tasarlandığı zarfın içinde.
   • `getItemLayout` (`index.tsx:286`, ofsetler `index.tsx:165-177`'de kümülatif hesaplanıyor) TAM ölçü veriyor — `scrollToIndex` (harita pini → kart, `index.tsx:182-186`) ve toplanan harita başlığı kesin çalışıyor. `estimatedItemSize` yaklaşıklığının yerini burada kesin ölçü almış; `@shopify/flash-list`'in package.json'da olmaması başlı başına kusur değil, token yorumu (`design/tokens.ts:604`) sözlükten kalma.
   • Monte kalan kartın kare-başına maliyeti zaten başka rayla bastırılmış: tek paylaşımlı dakika saati (`src/design/saat.tsx:12-24`, spec §2 kural 3 "asla kart başına timer") ve `Animated.loop` nefesleri yalnız `useNativeDriver: YERLI_SURUCU` ile (`src/design/motion.ts:10`, native'de true). Ekran dışında kalan kart RAM tutar, frame yemez. Ayrıca `useIlkYuklemeKademesi` (`index.tsx:120-124`) ilk yüklemede satırları 0→N 40 ms'lik adımlarla besliyor, yani parti fırtınası ayrıca yayılmış durumda.

3) Gerçek kullanıcı bu yolu yaşar mı? Tarif edilen biçimde hayır. 12 km yarıçapta 40 teklifin hepsinin dolması teorik tavan; tohumlanmış gerçek veri bir avuç teklif (review-notes: "3 dükkân açık", dördüncüsü katlamanın altında). Tavan dolsa bile kullanıcının gördüğü şey değişmiyor: ilk kare 10 hücre, kaydırma `getItemLayout` sayesinde sıçramasız. "Hangi kullanıcı, ne yaparken, neyi yanlış görüyor" sorusunun cevabı yok — görünür bir bozulma üretilemiyor.

4) review-notes'ta kayıtlı mı? Hayır, ne verified-good ne de false-alarm listesinde; ama belge Keşfet'i gece ve öğle karelerinde açıkça yürüyüp "Discovery at night ... do not rework" diye onaylamış, herhangi bir takılma/jank not etmemiş.

Sonuç: bu bir ayar düğmesi ("windowSize/removeClippedSubviews verilebilirdi"), somut kullanıcı hatası değil — brief'in "could be improved is not a finding" eşiğinin altında. İzlenmesi gereken tek gerçek koşul: listeye sayfalama (`onEndReached`) eklenip 40 tavanı kalkarsa aynı kod gerçekten sınırsız monte etmeye başlar; o değişiklikle birlikte `windowSize`/`removeClippedSubviews` verilmelidir.

- **(performans) `renderItem` is an inline arrow and nothing in the app is memoised, so every minute tick and every map pan re-renders all 40 mounted cards.**
  - İddianın harfi harfine gözlemleri doğru ama nedenselliği yanlış; önerdiği düzeltme tarif ettiği hatayı düzeltmiyor.

1) KOD GERÇEKTEN ÖYLE Mİ? Kısmen. `renderItem` satır 289'da inline arrow, `onPress={() => handleCardPress(item)}` satır 299'da, ve `grep -rn "memo(" src` boş dönüyor. CellRenderer de gerçekten PureComponent (node_modules/@react-native/virtualized-lists/Lists/VirtualizedListCellRenderer.js:63) ve `renderItem`'ı prop olarak alıyor (VirtualizedList.js:827).

2) DAKİKA TİKİ YARISI — KARTIN KENDİSİ ÇÜRÜTÜYOR. `apps/consumer/src/components/kepenk/VitrinKarti.tsx:75` → `const simdi = useSimdi();`. `useSimdi` → `useDakikaKovasi` → `useSaat` → `useContext(SaatContext)` (src/design/saat.tsx). Yani MOUNT OLAN HER KART SAATİN DOĞRUDAN CONTEXT TÜKETİCİSİ. Context değeri değişince her tüketici koşulsuz yeniden render olur; `React.memo` de `useCallback`'li `renderItem` de bunu ENGELLEYEMEZ. "Hiçbir şey memoize değil, bu yüzden dakika tiki 40 kartı render ediyor" cümlesi nedeni tersine çeviriyor: memoizasyon bu render'ların TEK BİRİNİ bile kaldırmaz. Kaldırmamalı da: `durum`, `kalanDk`, `p`, `guc`, `metaMetni` ve `ZamanHapi` metni hep `simdi`den türüyor (VitrinKarti.tsx:84-105) — kepenk göstergesinin dakikada bir hareket etmesi tasarımın kendisi. Spec §2 mühendislik kuralı 3 aslında "One shared clock for the whole list … Never a timer per card" diyor; `ClockProvider`'ın tek, dakika sınırına hizalanan `setTimeout`'u bunu birebir sağlıyor. İddia kural 3'ü spec'in yapmadığı bir talebe ("tik React pass'ine dönüşmemeli") yeniden yazıyor. `freezeOnBlur` gözlemi de aynı çürütmeyi miras alır: Siparişler'deyken maliyet, duran bir ekranın dakikada bir React pass'i, ve hiçbir memoizasyon onu kaldırmaz.

3) HARİTA PAN YARISI — RN'İN KENDİ FlatList'İ ÇÜRÜTÜYOR. `strictMode` varsayılanı `false` (node_modules/react-native/Libraries/Lists/FlatList.js:679 `strictMode = false`, :682 `const renderer = strictMode ? this._memoizedRenderer : this._renderer;`). Dolayısıyla FlatList'in HER render'ında `_renderer()` çalışır ve `{renderItem: renderProp}` döner; `renderProp` her seferinde YEPYENİ bir closure'dır (FlatList.js:638, :668). CellRenderer'ın shallow-compare ettiği `renderItem` işte bu sarmalayıcıdır, uygulamanın fonksiyonu DEĞİL. Yani index.tsx:289'daki inline arrow hücreleri geçersizleştiren şey değil.

4) ÜSTELİK FlatList ZATEN HER RENDER'DA YENİDEN RENDER OLUYOR. FlatList bir PureComponent (FlatList.js:307); atlanması için TÜM prop'ların kimliğini koruması gerekir. `KesifEkrani`'nin her render'ında üç prop daha taze kimlik alıyor: `keyExtractor` inline arrow (index.tsx:284), `getItemLayout` inline arrow (index.tsx:288) ve `refreshControl` — bir React elementi, yapısı gereği her render'da yeni nesne (index.tsx:304-310). Tek başına `refreshControl` shallow-compare'in ebediyen başarısız olmasını garanti eder. Sonuç: satır 289'u `useCallback`'e almak mount olmuş hücre render sayısında SIFIR değişiklik yaratır. İddianın gösterdiği fail taşıyıcı değil; ima ettiği düzeltme düzeltmiyor.

5) İKİNCİL ŞİŞİRMELER. "Kart başına ~12 Intl formatter inşası" yanlış: `mesafeMetni` (olcum.ts:141-144) 1000 m altında hiç Intl kullanmayan düz template string döner — bu ekranın olağan hali (review notes'un kendi omurgası "399 m → 1,3 km"). `fiyatMetni` tam lirada `sayi()` kısa yoluna girer; `katMetni`/`degerBandiMetni` `Number.prototype.toLocaleString` çağrısıdır, inşa edilmiş formatter değil. Gerçek sayı kart başına ~5-7 `toLocale*` çağrısı.

6) GERÇEK KULLANICI YOLU. Web'de pan yolu hiç yok: `src/components/MapPane.web.tsx` `onRegionChangeComplete` almayan bir `Pressable` placeholder. Native'de pan gerçekten fazladan bir tam liste pass'i maliyeti getiriyor, ama bu jest bitiminde, zaten kasıtlı olan `mapQuery` refetch'inin (bbox, index.tsx:140-150) yanında oluyor ve tasarımın 60 saniyede bir zaten ödediği ve kaçınamadığı pass'in aynısı.

7) review-notes-tam-gezinti.md'de ne verified-good ne de false-alarm olarak kayıtlı — yani madde 4 çürütmüyor. Çürüten maddeler 2 ve 3: hem platform varsayılanı (FlatList strictMode=false) hem de kartın kendi context aboneliği, iddia edilen mekanizmayı ve önerilen düzeltmeyi geçersiz kılıyor.

- **(performans) The spec's slow-Android degradation is fully built and never switched on: `basit` is defaulted to false on all three components and no call site ever passes it, and `expo-device` is a declared dependency that is never imported.**
  - Ham gözlemler doğru, ama "defect" değil — projenin kendi kaydında AÇIKÇA kapsam dışına alınmış, ölçüme bağlanmış bir Faz-3 sertleştirme kalemi.

1) Kod iddia edileni yapıyor mu? Evet, harfiyen. `Kepenk.tsx:57 basit = false`, `TamKepenk.tsx:58`, `AcikDukkan.tsx:63`; her iki koşul da tam kurulu (`Kepenk.tsx:179` düz `isikTasmasiDuz` View, `:282` `<Defs><Pattern>` atlanıyor, `:302` `fill={basit ? palet.metalCinko : url(#oluk)}`, `:320` `yanik && !basit`). `grep -rn "basit"` tüm `apps/consumer/src` + `app` içinde yalnız bu tanımları/JSDoc'ları döndürüyor: hiçbir çağrı yeri `basit={true}` geçmiyor. `Device.`/`deviceYearClass` src'de hiç okunmuyor (`expo-device` yalnız `apps/consumer/jest.setup.ts:58`'de mock'lu, `package.json:51`'de bağımlılık). `isikTasmasiDuz` (tokens.ts:160/236/305/405) sadece `basit` dallarından okunuyor.

2) Başka yerde ele alınmış mı? EVET — kodun değil, kaydın içinde, ve karar niyetli:
   - `docs/design/build-log-foundation.md:262-266`, başlığı bire bir **"### 4.8 Not implemented, by scope"**: "`deviceYearClass < 2019` degradation is wired into `<Kepenk/>` as a `basit` prop with both fallbacks (flat zinc fill, flat spill) but nothing reads `Device.deviceYearClass` yet — that belongs with the Phase 3 slow-Android pass, **where it can be measured**."
   - `docs/design/build-log-teslim.md:325-326`: "…and the `deviceYearClass < 2019` degradation, both of which belong to Phase 3."
   - Spec'in kendi inşa planı da aynı şeyi söylüyor: `consumer-app-spec.md:566` "**Phase 3 — integration and hardening.** … Slow-Android pass (`deviceYearClass` degradations, FlashList blank-cell measurement, marker snapshot audit)."
   Yani "yapılmış ama açılmamış" değil; "kanca bilerek bırakıldı, anahtar cihazda ölçülerek takılacak" — spec'in emrettiği sıra tam olarak bu. Denetim brief'i "could be improved"ı bulgu saymıyor; başlamamış, programlanmış bir faz kalemi de bulgu değil. Uygulamanın henüz o fazda olmadığı bağımsız olarak da görünüyor: `review-notes-tam-gezinti.md` "To fix — A" hâlâ 21 dosyanın `usePalet()` dönüşümünü bekliyor ve "conversion is required before the redesign can be called done" diyor — Faz-1 yüzeyleri bitmemişken Faz-3 sertleştirmesinin çalışmamış olması beklenen durum.

3) Gerçek kullanıcı bunu yaşar mı — iddia edildiği büyüklükte, hayır. Maliyet tablosu şişirilmiş: "40 mounted card" yanlış; keşif listesi `src/app/(tabs)/index.tsx:279` `Animated.FlatList` + `getItemLayout` ile sanallaştırılmış, aynı anda pencere kadar (birkaç) kart mount olur. Dahası spec'in "Four rules hold 60fps on a 720p Android" dediği dört kural (spec §2 r.1-4) ZATEN uygulanmış ve `Kepenk.tsx:12-31`'de tek tek belgelenmiş: slat başına node yok (tek `<Rect>` + `<Pattern>`), geometri değil `translateY` (ve tam piksele snap), kart başına timer yok (`p` dışarıdan), dudak ayrı antialiased `<Rect>`. `basit` bunların üstüne pre-2019 donanım için ikinci kemer; onsuz kare düştüğüne dair hiçbir ölçüm yok — build-log'un "where it can be measured" demesinin sebebi de bu.

4) `review-notes-tam-gezinti.md`'de ne verified-good ne de false-alarm olarak geçiyor (orada hiç geçmiyor) — bu tek başına iddiayı kurtarmıyor, çünkü (2) ve (3) onu zaten düşürüyor.

Not: iddia teknik olarak uygulanabilir de olurdu (`expo-device@57` Android'de `YearClass.get(context)`, iOS'te model tablosu, web'de `null` döndürüyor), ama bunu bugün bir "hata" diye açmak, spec'in Faz-3'e bilerek koyduğu ve ölçüm gerektiren bir işi hata kuyruğuna taşımak olur.

- **(performans) The redeem screen subscribes to the 1Hz rail at screen level, so the entire full-screen shutter/room/handle tree reconciles once a second — defeating the very isolation `CanliSaat` exists to provide.**
  - The mechanical facts check out, but every load-bearing part of the claim's argument fails.

1) WHAT IS TRUE. `apps/consumer/src/app/redeem/[id].tsx:120` really is `const simdiMs = useSaniyeTiki();` at screen level, and none of the children are memoised — `grep -n "memo"` across `AcikDukkan.tsx`, `TamKepenk.tsx`, `HeroTabela.tsx`, `Kod.tsx`, `KepenkKolu.tsx`, `CanliSaat.tsx` returns nothing, no `experiments.reactCompiler` in `app.json`, no `babel.config.js`. So yes, the screen reconciles once a second, and line 477 does re-run `toLocaleDateString`. That is where the agreement ends.

2) THE SCREEN CANNOT NOT SUBSCRIBE — the 1Hz value is load-bearing, and one of its consumers is INSIDE the subtree the claim wants isolated. `kalanSn` (lines 205-208) drives the auto-close `indir()` at `[id].tsx:210-212`, i.e. the shutter coming back down at 30s, and it is also rendered as a visible per-second countdown at lines 516-521 (`testID="kepenk-sayac"`, `t("kepenk.kapanisSayaci", { sn: kalanSn })`) — inside `styles.acikIcerik`, a sibling of the code and the button. `simdiMs` additionally feeds `pencereDurumu` (274), `kepenkIniyorMu` (381) and `kapanmayaDk` (392). A per-second countdown on screen means a per-second render of that subtree by construction; there is no "isolation" being defeated, only static prop-identical siblings coming along.

3) THE CLAIM MISREADS THE DOC IT CITES. `design/saat.tsx:22-24` documents APP-WIDE isolation — "an OPT-IN 1Hz tick, mounted only by the redeem screen. The interval does not exist until something subscribes, and stops the moment the last subscriber unmounts." That property is intact: `grep -rn "useSaniyeTiki" src/` finds exactly two production call sites, this screen and `CanliSaat.tsx:44`, and the `aboneler` Set at `saat.tsx:86-115` shares ONE interval between them. `[id].tsx:116-119` states the subscription is deliberate. Nothing in `CanliSaat.tsx` claims the screen must not subscribe.

4) THE ASSERTED USER-VISIBLE FAILURE IS IMPOSSIBLE ON THE PATH DESCRIBED. The whole cost story is "the §4.5 sweep stutters in front of a baker". `CanliSaat.tsx:85-97` runs that sweep with `useNativeDriver: YERLI_SURUCU`, and `design/motion.ts:10` is `export const YERLI_SURUCU = Platform.OS !== "web";` — true on iOS and Android. A native-driven translateX runs on the UI thread; a JS-thread reconcile cannot stutter it. The only surface where the driver is off is web, and web is precisely where the described scenario does not exist: `lib/parlaklik.ts:28` makes `DESTEKLENIYOR` ios/android only, so there is no brightness-1.0, no keep-awake and no counter.

5) THE MAGNITUDE IS NOT THERE EITHER. Per tick: `useSvgKimlik` (`components/kepenk/svg-kimlik.ts`) is `useRef`-stable, so the `<Defs>`/`<Pattern>` ids do not churn; `KepenkKolu.tsx:80-124` wraps the `PanResponder` in `useMemo` with stable deps, so the gesture is never reset mid-drag; `useTezgahModu`'s effect deps are `[etkin]` (`parlaklik.ts:75`), so brightness is not re-applied; the LinearGradient/`react-native-svg` props are value-identical, so the diff yields no native updates; `heroTabelaBoyutu` is ≤22 iterations of table lookups over `TABELA_HARF_GENISLIKLERI`. And the "most expensive ICU option set in the app" framing is wrong on its own terms: `CanliSaat.tsx:46` already calls `formatClockWithSeconds`, which is `toLocaleTimeString("tr-TR", {hour, minute, second, timeZone})` (`lib/format.ts:56-63`) — the same class of Intl work, once a second, by design and unavoidably. One extra Intl call per second has ~1000 ms of slack against a 16.7 ms frame budget.

6) Not in `docs/design/review-notes-tam-gezinti.md` either way — so point 4 of the brief does not rescue it, but points 2 and 3 kill it.

This is an efficiency observation with no demonstrable user cost, and "fixing" it means hoisting `kalanSn`/the auto-close out of the screen that owns the 30-second window — real regression risk on the app's one critical screen, for work that is already off the critical path.

- **(performans) Every offer card and every order row independently queries the platform for reduce-motion, so mounting the list fires one native round-trip and one listener registration per row and then re-renders every row a second time.**
  - The hook is per-instance as described, but the costs the claim attributes to that are not real, and the fix it implies would not remove the cost it leads with.

(1) The "listener registration per row" is not native. AccessibilityInfo.addEventListener (node_modules/react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo.js:436-440) is `RCTDeviceEventEmitter.addListener(deviceEventName, handler)` — a JS-side array push, no native module involvement. RN's vendored EventEmitter has no max-listener warning either. 40 of them are free.

(2) The Android "native round trip" reads a cached field, not the system. ReactAndroid/src/main/java/com/facebook/react/modules/accessibilityinfo/AccessibilityInfoModule.kt:157-159 is `override fun isReduceMotionEnabled(successCallback: Callback) { successCallback.invoke(reduceMotionEnabled) }`; `reduceMotionEnabled` is a Kotlin field set once in `init` (line 96) and refreshed by a ContentObserver. No Settings.Global read per call, and calls issued in one JS tick batch into a single flush.

(3) Decisively: the remedy does not fix the headline cost. A hoisted provider still goes null -> false exactly once and re-renders every consumer row, so "re-renders every row a second time" is unchanged; and each Kepenk still owns its own Animated.Value and fires its own Animated.timing (Kepenk.tsx:87-108), so the N simultaneous entry rolls are byte-for-byte identical. Hoisting saves 39 cached-boolean callbacks and 39 array pushes and nothing else on the path described.

(4) The spec citation is a misreading. consumer-app-spec.md:555 reads "`ClockProvider` exposing `minuteBucket` (60s) ... `useReduceMotion()` subscribed" — it names one a Provider and the other a hook in the same sentence. The rule that does exist, §2 engineering rule 3 ("ONE shared clock for the whole list ... never a timer per card"), is honoured: saat.tsx's ClockProvider is the single timer and useSimdi is context.

(5) No user-visible failure on the stated path. Both screens are virtualized FlatLists ((tabs)/index.tsx:279 Animated.FlatList with getItemLayout; (tabs)/orders.tsx:~90 FlatList), so 40/50 are data-length ceilings, not mount counts (RN default initialNumToRender is 10). Every mounted card already re-renders wholesale once a minute through useSimdi() -> useDakikaKovasi() context, so one extra mount-time render is 1/60th of churn the design already accepts. The null -> false hold is deliberate and documented (reduce-motion.ts:13-18, Kepenk.tsx:88-90) and pinned by a test (src/__tests__/design-theme.test.tsx:129-144, "says 'not yet known' before the platform has answered"). Per-card subscription is the established pattern in this component anyway — usePalet(), useSimdi() and useTranslation() are all per-card. Nobody scrolling Keşfet or opening Siparişler sees anything wrong.

- **(performans) Each Siparişler row runs its own AsyncStorage read and its own store lookup, so opening the tab with a full page of orders fires ~50 SQLite reads and a fan-out of HTTP requests.**
  - Mekanizma doğru okunmuş ama maliyeti yanlış hesaplanmış; iddianın dayandığı üç varsayımın üçü de kodda çürüyor.

(a) "Liste hepsini birden basıyor, window prop'u yok" — orders.tsx:86 bir ScrollView+map değil, `FlatList`. Prop yokluğu sanallaştırma yokluğu değil: RN varsayılanları `initialNumToRender: 10` / `maxToRenderPerBatch: 10`, yani ilk karede 10 satır mount olur, kalanı ~50ms'lik partiler halinde gelir. "50 eşzamanlı AsyncStorage getItem" tarif edilen yolda hiç oluşmuyor.

(b) "100 ek render geçişi" — `snapshot`/`snapshotChecked` state'i use-order-details.ts:42-43'te HER SATIRIN KENDİ hook örneğinde duruyor. `setSnapshot` sadece o 88pt satırı yeniden çiziyor, listeyi değil. 100 tane tek-satır güncellemesi, birkaç View'lık iş.

(c) O(n²) `.find()` (use-order-details.ts:40) = 50×50 = 2.500 string karşılaştırması, hem de zaten bellekteki paylaşılan query verisi üzerinde — mikrosaniyeler.

Asıl öldüren nokta HTTP tarafı: `useStoreProfile` yalnızca `snapshotChecked && !snapshot` iken açılıyor (use-order-details.ts:58-61), yani normal cihazda HİÇ istek yok. Yeniden kurulum senaryosunda da istekler React Query'nin ortak `["discovery","store",id]` anahtarıyla dedupe ediliyor VE bu anahtar ailesi tam olarak uygulamanın kendi persister'ının diske yazdığı ailedir: `shouldPersistQuery` rootKey==="discovery" için true döner (lib/query-client.ts:45-48) ve _layout.tsx:147-152'de `dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery }` ile bağlanmıştır; `gcTime: 24h`. Yani fan-out en fazla bir kez olur, sonraki soğuk açılışlarda diskten geri yüklenir. Profil'deki `useStoreNames` de aynı cache'i paylaşır ve isimleri gerçekten ekrana basar (SeninSokagin'e `dukkanAdi` olarak, profile.tsx:111 ve 153) — israf değil, gösterilen içerik.

Ayrıca sözleşmede toplu mağaza uçları yok (packages/api-client/src/domains/discovery.ts yalnızca `store(id)` sunuyor) ve bu backend boşluğu lib/purchase-cache.ts:3-11'de zaten belgelenmiş — "en küçük doğru düzeltme" istemci tarafında mevcut değil.

Son olarak iddia, denetimin kendi barını geçmiyor: hangi kullanıcının ne gördüğü söylenmiyor. Satırlar ilk karede çıplak rezervasyondan zaten boyanıyor, liste ağa bloke olmuyor, spinner yok, yanlış veri yok. Ölçülen tek gerçek maliyet, JS iş parçacığı DIŞINDA yürüyen, ~200 baytlık birkaç düzine SQLite okuması. Bu bir "iyileştirilebilir", defect değil. (İlgisiz ve ayrı bir gözlem: snapshot çözülene kadar satır bir kare boyunca `orders.unknownStoreName` gösteriyor — ama bu tek siparişte de olur, iddianın performans tezini doğrulamaz.)

- **(performans) The collapsing map header animates `height` off a JS-driven scroll value, so the first 112pt of every scroll re-lays out both the header and the FlatList beneath it on every frame.**
  - The code does what the first sentence of the claim says, but the cost it prices is not the cost the code pays, and the shape it flags is the one the spec explicitly prescribes.

1) WHAT THE CODE ACTUALLY DOES — the mechanical half of the claim is accurate.
`apps/consumer/src/app/(tabs)/index.tsx:154-160` builds `Animated.event([{nativeEvent:{contentOffset:{y: scrollY}}}], { useNativeDriver: false })`, feeds it at `scrollEventThrottle={16}` (line 286), and `HaritaMini.tsx:25-29` interpolates that value into `height` on the outer `Animated.View` (line 38). `disKap` and the `Animated.FlatList` (`styles.doluAlan: {flex:1}`, index.tsx:330) are siblings in `Screen`'s flex column, so over the first 112pt the header shrinks and the list's frame grows on the same frame. So far, agreed.

2) THE PRICED FAILURE IS THE WRONG MECHANISM — this is what kills it.
 a. "its `_onLayout` fires and it recomputes its render window ~60 times a second". Read `_onLayout` in `apps/consumer/node_modules/@react-native/virtualized-lists/Lists/VirtualizedList.js:1408-1421`: it writes `visibleLength`, calls `props.onLayout`, then `_scheduleCellsToRenderUpdate()` and `_maybeCallOnEdgeReached()`. But `_onScroll` ALREADY calls `_scheduleCellsToRenderUpdate()` on every single scroll frame (line 1762) whether or not a header animates — the header's layout event adds a second call to a function that (line 1779-1809) coalesces into one pending `setTimeout(..., updateCellsBatchingPeriod ?? 50ms)` unless `_shouldRenderWithPriority()` says the viewport is starving. The window is not recomputed 60×/s because of the header; it is scheduled at most once per 50 ms, exactly as it would be without the header.
 b. "over the ~2.000 mounted views from finding 1". `getItemLayout` is supplied (index.tsx:288, backed by the precomputed `duzen` at 166-174), so VirtualizedList never measures a cell to build its window — the window is integer arithmetic over ≤ ~45 rows (`pageSize: 40`, index.tsx:94, plus district headers). No mounted view is touched.
 c. "re-lays out ... the FlatList beneath it". What changes is the ScrollView's own frame. A vertical ScrollView measures its content with the width constraint unchanged and the main axis unbounded, so Yoga's cached layout returns for the content subtree: the cards are not re-measured, and neither is the map — `icKap` carries an explicit `height: HARITA_ISTIRAHAT` (`HaritaMini.tsx:52`), so the parent's shrinking height never reaches it. Per frame this is two view frames changing, not ~2.000.

3) THE JS CROSSING IS NOT AVOIDABLE AND IS NOT CAUSED BY THIS.
"every scroll frame crosses into JS" is the baseline for any FlatList: VirtualizedList installs its own JS `_onScroll` on the underlying ScrollView (VirtualizedList.js:1095) and invokes `props.onScroll` from inside it (1691-1696). Turning on the native driver is impossible for `height` in any case, and would not remove the crossing for anything else on this screen. There is no cheaper driver available either — `react-native-reanimated` is not a dependency (apps/consumer/package.json:36-74), so `Animated` with `useNativeDriver:false` is the only tool that can express a collapsing container at all.

4) IT IS THE SPEC'S OWN PRESCRIPTION, NOT A DEVIATION.
`docs/design/consumer-app-spec.md:300` mandates "the *container* height animates 168 → 56 with `overflow: hidden` while the `MapView` inside keeps a constant 168pt height and translates up", and the spec's own code sketch at line 335 is literally `<Animated.View style={haritaKabi}>  // height 168→56`. §5.12 names the one operation that is expensive here — resizing the live `MapView` — and the implementation avoids it, which the claim itself concedes. Reporting the spec's mandated structure as a defect requires evidence that the mandate is wrong; the claim supplies an argument, not a measurement.

5) NO CONCRETE USER-VISIBLE FAILURE.
The brief requires "which user, doing what, sees what wrong". The claim ends at "on the phone with the least headroom" with no frame time, no dropped-frame count, no captured frame. Its severity is borrowed entirely from another, unverified finding's "~2.000 views" estimate, which §2b shows is not on the per-frame path. That is a "could be improved" note, explicitly excluded.

Nothing in `docs/design/review-notes-tam-gezinti.md` records this either way — it is not a listed false alarm — but points 2, 3 and 4 defeat it on their own. Any real fix here (absolutely positioning the header and giving the list a static top inset, so the chips/count/banner stack would also have to be restructured) is a screen rewrite, not a small correction, and would be justified only by a measurement nobody has taken.

- **(acik-bulgular) I12 STILL REAL — the automated rollback recreates only the api container and declares success on a DB-free liveness probe, so a schema-incompatible rollback reports "Rollback succeeded" while production is broken**
  - The individual code facts check out, but the harm narrative — "the on-call operator reads 'Rollback succeeded' while production is broken" — is defeated by the very next step in the same file, plus two independent guards.

WHAT IS TRUE. /home/tarik/Projects/kurtar/.github/workflows/release-deploy.yml:767 really is `docker compose ... up -d --force-recreate api` (api only) and :770 really gates on `curl ... /api/health` printing "Rollback succeeded — api is healthy again on ${prev_tag}". /home/tarik/Projects/kurtar/backend/src/modules/health/health.controller.ts:22-27 really returns a static `{status:"ok", service:"kurtar-api", uptimeSec}` with no Prisma, and there is no /api/ready. The migration is real: /home/tarik/Projects/kurtar/backend/prisma/migrations/20260815200000_social_trust_and_moderation/migration.sql:95-97 does `DROP COLUMN "category"` then re-adds it as `"ComplaintCategory"` (init/migration.sql:438 created it as TEXT).

(2) WHAT ALREADY HANDLES IT — decisive, three ways.
(a) The sibling rollback step at :777, `if: failure() && steps.migrate.conclusion != 'skipped' && steps.migrate.conclusion != 'cancelled'`, fires on EXACTLY the described path (migrate succeeded at :679, swap/health failed), runs AFTER the api step, and its condition does not depend on the api step's outcome. It emits `::warning::The migrate-deploy step ran, and may have applied this release migrations, before the failure...` and `::error::If the schema needs reverting too, restore the pre-deploy backup:` with the literal `gunzip -c <file> | docker exec -i kurtar_db_prod psql -U kurtar -d kurtar` command. GitHub renders `::error::` as a run-summary annotation, so the operator's last and loudest signal is "the schema may have changed, here is the restore command" — not the api step's echo.
(b) There is no `continue-on-error` anywhere in the workflow (grep: none). The step that actually failed (swap :682 / health :693 / health-frontends :708) has already set the job to failure; `exit 0` inside an `if: failure()` step cannot turn the run green. The claim's premise that a success message is the operator's signal is false — the run is red with error annotations.
(c) The api-only scope is not an oversight: it is a risk-assessed, documented KNOWN GAP in the workflow's own header at :89-94 ("all four images share one release version tag, and the built frontends are static/stateless"), and it is a tracked engineer checklist item at /home/tarik/Projects/kurtar/docs/launch-checklist.md:55. The DB-free liveness probe is likewise deliberate and pinned by /home/tarik/Projects/kurtar/backend/src/modules/health/health.controller.spec.ts:28-34 ("returns exactly the documented shape") — a liveness probe that touches Postgres is an anti-pattern (a DB blip would make the orchestrator kill a healthy API), so "DB-free" is the intended contract, not a defect.

(3) NO REAL USER IS ON THIS PATH. `git tag` in the repo is empty — this tag-triggered workflow has never executed once, which docs/launch-checklist.md:55 records as INERT and "reviewed-not-proven until one real tag-triggered deploy succeeds". Triggering the described failure additionally needs a backward-incompatible migration to succeed AND the swap-or-health gate to then fail. And none of this touches the audit's subject: apps/consumer is an Expo app, not one of the four deployed services (api, merchant-web, admin-web, landing).

(4) Not in docs/design/review-notes-tam-gezinti.md (that file is the consumer walkthrough, no ops content), so point 4 does not defeat it — but 2 and 3 do. Notably the finding's own entry at /home/tarik/Projects/kurtar/docs/review/open-findings.md:127 already concedes this in its own words: "the operator is misled by one step's message, not by a green pipeline. The api-only scope is acknowledged in the workflow header at :89-94 as a KNOWN GAP." The claim as re-stated ("STILL REAL", operator believes production is fine) drops that concession and overstates what the code does.

RESIDUE, not a defect: one optimistic echo string, and three frontend containers not force-recreated on an unexercised pipeline whose IMAGE_TAG has already been rewritten at :764. That is a "could be tightened" on already-tracked ops hygiene, with no concrete user seeing anything wrong today.

- **(acik-bulgular) I13 STILL REAL — filing a complaint starts the 15-day ETAHS clock with no notification of any kind to the merchant who has to answer it**
  - Mekanik yarısı doğru ama iddia edilen zarar ulaşılamaz. Evet: complaints.service.ts:138-147 bileti yalnız slaDeadlineAt ile yazıyor, modülde outbox/publish yok, OUTBOX_EVENT_TYPES'ta complaint tipi yok, backend/templates/emails/ altında complaint şablonu yok. Fakat iddianın anlattığı yolda ORTADA BİR İŞLETME YOK. Tüketici uygulamasındaki tek giriş noktası apps/consumer/src/app/(tabs)/profile.tsx:180 → router.push("/complaint/new") ve parametre yollamıyor; `grep -rn "complaint/new" apps/consumer/src` sadece bu satırı, _layout.tsx:116 modal kaydını ve iki testi döndürüyor (order/[id].tsx yalnız cancel/redeem/rate'e gidiyor). complaint/new.tsx:31,46 kimsenin doldurmadığı bir reservationId parametresini okuyor, dolayısıyla istek {category, description} ile gidiyor; complaints.service.ts:112-113'te merchantId ve reservationId null kalıyor ve satır merchantId: null (:141) ile yazılıyor. listAssigned `where: { merchantId, ... }` (:171) ile filtrelediği için bilet hiçbir işletmenin ComplaintsPanel'inde görünmez, addMessage'ın MERCHANT dalı da asla eşleşmez — yani "kendisine haber verilmeden 15 günlük saati başlatılan karşı taraf" diye biri yok; iddianın "işletme ancak merchant-web'deki atanmış-şikayet listesini açarsa görür" cümlesi de yanlış, orada da hiç görmez. Bileti gerçekten üstlenen taraf (platform/ETAHS'taki aracı hizmet sağlayıcı) ise üç kanaldan haberdar: admin-dashboard.service.ts:57-66 openComplaints + complaintsSlaAtRisk (cron ile aynı 48s penceresi) panoda sayıyor; complaint-sla-cron.service.ts:80-91 son 48 saatte ops digest e-postası + error log, :93-101 ihlal digest'i, escalateBreached aynı işlemde AuditLog satırı yazıyor. İkincil yarı da kusur değil: :151'deki status IN ('OPEN','MERCHANT_RESPONDED') koruması :134-143'te açıkça belgelenen idempotens sözleşmesi (ESCALATED satırı yeniden eşleşseydi ops'a sonsuza dek tekrar alarm giderdi) ve yükseltme kara delik değil — audit + error log + ops e-postası var, bilet admin-web ComplaintsListPage'de varsayılan "ALL" filtresiyle (:20-27) DeadlineBadge'iyle listede duruyor. review-notes-tam-gezinti.md'de şikayetle ilgili hiç kayıt yok (ne doğrulanmış-iyi ne yanlış-alarm), yani onu ne kurtarıyor ne de gömüyor; bulguyu düşüren şey anlatılan kullanıcı yolunun işletme ataması üretmemesi. NOT (ayrı bir bulgu, bu iddia değil): tüketici uygulamasında şikayete siparişi iliştirmenin hiçbir yolu olmadığı için merchant-web'in ComplaintsPanel'i yapısal olarak hep boş kalıyor.

- **(acik-bulgular) M12 STILL REAL — both deploy commands in the operations runbook fail verbatim on the real production host**
  - Claim asserts BOTH runbook commands fail; only one leg survives inspection, and the scenario that would make it bite is not a path the runbook offers.

LEG 1 (ops/ path) — self-defeating. docs/operations.md:12 says `docker compose -f ops/docker-compose.prod.yml pull`. release-deploy.yml:586-589 does scp the compose file flat to /root/kurtar/ (only scripts/ is nested, :595-598). But the claim's own scenario is "an operator doing the FIRST HAND deploy" — a hand-provisioned host is a repo clone, where `ops/docker-compose.prod.yml` is the CORRECT path and the command works. The flat layout exists only on a pipeline-provisioned box, i.e. one where release-deploy.yml already executed steps 4-6 itself and the operator has no reason to retype step 4. The two halves of the claim cannot both be true at once.

LEG 3 (env-file) — factually wrong as stated. The claim says the `${IMAGE_TAG:?IMAGE_TAG is required}` guard (ops/docker-compose.prod.yml:102) "aborts the command outright". operations.md:12 literally instructs "with `IMAGE_TAG=vX.Y.Z`", so an operator following the line satisfies that exact guard; :18 additionally sends the reader to "each compose file's own header comment for the full table and required `.env.production`/`.env.staging` variables", and that header (ops/docker-compose.prod.yml:30-39) enumerates GHCR_OWNER/POSTGRES_PASSWORD. The named guard is the one variable the runbook does tell you to set.

LEG 2 (missing --workdir) — factually TRUE but not a defect on the described path. backend/Dockerfile:69 `WORKDIR /app`, :87 `COPY --from=build /app/backend/prisma ./backend/prisma`; the api service in ops/docker-compose.prod.yml declares no `working_dir`; neither package.json carries a `prisma` key and there is no prisma.config.ts — so from /app the CLI finds no schema, which is exactly why release-deploy.yml:679 and scripts/db-migration-doctor.sh:66-77 (compose_run) both pass `--workdir /app/backend`. However operations.md:9-14 is a DESCRIPTION of the CI-driven deploy, not a hand procedure: :7 frames it as "tag -> CI -> compose pull -> migrate -> swap", :11 hands control to release-deploy.yml, :22 states the doctor is "called twice per deploy by release-deploy.yml", :13 and :14 are present-tense narration of pipeline stages ("Migrations run BEFORE the api container swaps", "`docker compose up -d` swaps the containers" — nobody types that after CI already did), and the one place the runbook does address manual intervention (:37) says "do the manual step it recommends, then re-trigger the deploy". The runbook never instructs a hand deploy at all.

NO USER CAN HIT IT TODAY. release-deploy.yml:17-21 records that PROD_SERVER_HOST is unset and "no server has been provisioned for this project yet" — there is no production host on which either command can fail. (The recorded finding's supporting premise is stale in the other direction too: it says "`git remote -v` is empty", but origin is now https://github.com/mtarikucar/kurtar.git, which makes the pipeline path MORE likely, not the hand path.)

COST IF SOMEONE DOES COPY-PASTE :13: an immediate, self-explaining "Could not find Prisma Schema" before anything is touched — no partial deploy, no data risk, seconds to diagnose next to db-migration-doctor.sh which shows the flag. That is doc polish, not a defect that costs a real user; the recorded entry itself already downgrades it to "operator time and confusion".

If the team wants the doc tightened anyway, the only line worth changing is :13 — add `--workdir /app/backend` so the narrated command matches release-deploy.yml:679 verbatim. Leave :12 alone: rewriting it to the flat /root/kurtar layout would break it for the repo-clone case the claim's own scenario assumes.

- **(acik-bulgular) M11 STILL REAL — every migration ships a proven-reversible down.sql, but production has no procedure to apply one and the runbook never says so**
  - İddianın olguları doğrulanıyor ama zarar zinciri kopuyor. (a) Doğru olanlar: docs/operations.md'de "Reverting a migration" bölümü yok — down.sql|revert|rollback grep'i yalnızca :33-34 satırlarını buluyor (bunlar BAŞARISIZ bir migration için `migrate resolve`, başarılı birinin geri alınması değil); scripts/db-migration-doctor.sh down.sql'den hiç söz etmiyor; quality-gates.yml:305-323 down.sql varlığını dayatıyor ve :182-200 gerçek round-trip'i koşup "Round-trip OK" basıyor. (İddia "15 klasör" diyor, bugün 18.) (b) Ama iddianın aksine üretimde BELGELİ bir şema-geri-alma yordamı VAR ve tam da hata anında yüzeye çıkıyor: docs/operations.md:50-56 "### Restoring" ve release-deploy.yml:777-796 — `if: failure() && steps.migrate.conclusion != 'skipped'` ile tetiklenip restore komutunu ve gerekçesini basıyor ("reverting a partially-applied migration safely requires human judgement, matching db-migration-doctor.sh own policy of never auto-resolving to --applied"). down.sql'den ağır, ama mevcut, doğru ve bilinçli bir tercih. (c) Zincirin ilk halkası "operatör üretimin down.sql uygulayabileceğini makul biçimde varsayar" — runbook down.sql'i hiç anmadığı için böyle bir beklenti yaratmıyor. Bu inancı doğurabilecek TEK yer quality-gates.yml:165-200 ve orası zaten iddianın "operatörün bilmediği" dediği mekanizmanın kendisini yazıyor: ":171-172 `_prisma_migrations` ledger (untouched by any down.sql, by design)" ve ":174-177 with the ledger intact, `migrate deploy` would see every migration already marked 'applied' and skip re-running any of them". Yani operatörü yanıltacağı varsayılan kaynak, tam tersini öğretiyor. (d) Üründe hiçbir şey yanlış davranmıyor: `prisma migrate deploy` platform gereği ileri-yönlü, bir down.sql'i çalıştıramaz; deploy hattında onu koşan hiçbir yol yok. Bozulma, sistemin hiçbir yerde işaret etmediği, operatörün kendi uydurduğu bir yordamı gerektiriyor — erişilebilir bir yol değil, varsayımsal insan hatası. Bulgunun kendi kaydı da bunu kabul ediyor (docs/review/open-findings.md:245: "this is a documentation gap, not a code defect"). (e) review-notes-tam-gezinti.md migration'dan hiç söz etmiyor (yanlış-alarm/doğrulanmış listesinde değil) ve konu denetlenen apps/consumer yüzeyinin tamamen dışında. Sonuç: değerli bir ~10 satırlık doküman eklemesi, ama denetim brief'inin dışladığı "iyileştirilebilir" sınıfı — sistemin sunduğu bir yolda yanlış bir şey gören gerçek kullanıcı yok.

- **(acik-bulgular) M15 STILL REAL — three me/* controllers put @Actors on methods instead of the class while ActorsGuard fails OPEN on missing metadata**
  - Kod literal olarak iddiayı doğruluyor (actors.guard.ts:31-33 `if (!requiredActors || requiredActors.length === 0) return true;`, ve üç controller'da @Actors yalnız metot seviyesinde) — ama iddia üç ayrı yerden çürüyor.

(2) "Fail open" bir gözden kaçma değil, belgelenmiş ve teste bağlanmış bir platform sözleşmesi. actors.decorator.ts:8-11: "A route with no @Actors() annotation is open to any authenticated actor (JwtAuthGuard already requires a valid token; ActorsGuard only narrows further)". actors.guard.spec.ts:14-20 bu davranışı birebir pinliyor ("allows any authenticated actor when no @Actors() metadata is present"). Bugün bu varsayılana bilerek dayanan 5 controller var (discovery, moderation/reports, auth, payments-webhook, health). Yani varsayılanı deny'a çevirmek bu üç dosyanın bug fix'i değil, platform çapında bir karar.

(3) İddia edilen zarar veri modeli gereği ERİŞİLEMEZ. Üç controller'daki her handler `@CurrentUser("id")` alıyor — çağıranın KENDİ principal id'si; hiçbiri URL'den ya da body'den kullanıcı id'si almıyor. jwt.strategy.ts:70/88/103'e göre MERCHANT'ın id'si MerchantUser.id, ADMIN'inki AdminUser.id. Buna karşılık schema.prisma:330-331 NotificationPreference.userId → User'a @unique FK, schema.prisma:313-314 PushToken.userId → User'a FK, ve user-location.service.ts `prisma.user.update({ where: { id: userId } })` yapıyor. Dolayısıyla decorator'ı unutulmuş varsayımsal bir handler'a merchant token'ıyla vurulsa bile, User'da var olmayan bir cuid ile P2025/P2003 alır. "MERCHANT veya ADMIN bir consumer'ın kendi satırına erişir" senaryosu ne bugün ne de tarif edilen gelecekteki şekliyle mümkün — iddianın failure scenario'su veri modeli hakkında yanlış.

(4) Gerçek kullanıcı etkisi sıfır; iddianın kendisi kabul ediyor ("Not exploitable today — every existing handler declares one"). Hiçbir kullanıcı, hiçbir yolda, yanlış bir şey görmüyor — brief'in açıkça dışladığı "could be improved" sınıfı. Ayrıca zaten docs/review/open-findings.md:273-279'da aynı düzeltme taslağıyla bilinen latent madde olarak kayıtlı; canlı defect diye yeniden raporlamak bilgi katmıyor. (docs/design/review-notes-tam-gezinti.md'de geçmiyor, o doküman consumer UI gezintisi.)

- **(dil-ve-metin) Map markers carry hardcoded Turkish accessibility labels, bypassing i18n and the three keys written for them**
  - Kod iddia edildiği gibi: MapPane.native.tsx:81-85 ve :131 Türkçe literal taşıyor, useTranslation import edilmiyor, harita.pinEtiket / pinEtiketSecili / kumeEtiket anahtarları (tr.json:133-135, en.json:133-135) hiçbir yerde kullanılmıyor. Ama iddianın tarif ettiği ARIZA gerçekleşemiyor.

(a) Uygulama tek dilli ve dil SABİT: src/i18n/index.ts:16-24 `lng: "tr"`, `fallbackLng: "tr"`; dosyanın kendi yorumu "tr is the only UI language shipped for launch … No device-locale auto-detection … (rather than wiring expo-localization)". `changeLanguage` src/ içinde SADECE 4 test dosyasında geçiyor; dil seçici ekran yok, expo-localization bağımlılığı yok. en.json çalışma anında erişilemez bir ileriye-dönük yer tutucu. Yani Harita sekmesindeki TalkBack kullanıcısı doğru Türkçeyi duyuyor.

(b) İddia edilen "copy drift" kullanıcı aleyhine değil: koddaki `"Mağaza, 69₺'den başlayan fiyatlarla"` pinin ROLÜNÜ de söylüyor, anahtar (`"{{fiyat}}'den başlayan fiyatlarla"`) söylemiyor — kod daha bilgilendirici. Diğer iki fark yalnızca noktalama: "Seçili," vs "Seçili:", em-dash vs virgül; TalkBack ikisini de duraklama olarak okur. Hiçbir kullanıcı yanlış/eksik/yabancı dilde bir anons duymuyor.

(c) CI de kırılmıyor: M22 testi (src/__tests__/accessibility-i18n.test.tsx) yalnızca KepenkKolu ve CanliSaat'i testID ile doğruluyor, literal taraması yapmıyor; design-yasaklar.test.ts sadece textTransform ve .toUpperCase() grepliyor. apps/consumer'da locale-parity veya kullanılmayan-anahtar testi HİÇ YOK (repodaki tek i18n-parity.test.ts landing/ uygulamasına ait). Kullanılmayan anahtar her kapıdan geçer.

(d) Bağlam: bu anahtarlar harita sekmesini oluşturan aynı commit'te (66b9097) eklenmiş ve hiç bağlanmamış; harita bölümündeki 10 anahtarın 8'i ölü (baslik, webUyari, webUyariGovde, magazaGor, sonucAdet dahil — web paneli discover.* kullanıyor). Yani hedefli bir regresyon değil, genel bir ölü-anahtar birikimi.

Geriye kullanıcıya hiçbir bedeli olmayan bir konvansiyon ihlali kalıyor; denetimin çıtasına göre defect değil, temizlik. Dil seçici veya cihaz-locale algılama geldiği GÜN gerçek defect olur ve o değişiklikle birlikte bağlanmalı.

- **(dil-ve-metin) Cancelling a paid order confirms nothing — the screen just pops, and `cancel.success` sits unused**
  - İddianın alıntıladığı satırlar doğru ama tarif ettiği başarısızlık gerçek değil — iptalin onayı, modal kapandığında ALTTAN çıkan ekranın durum değişikliğidir.

1) Kod gerçekten öyle: `apps/consumer/src/app/cancel/[id].tsx:61-69` → `await cancelReservation.mutateAsync(reservation.id); router.back();`. Ve `cancel.success` yalnızca `src/i18n/tr.json:282` / `en.json:282` içinde var, hiçbir yerde çağrılmıyor. Buraya kadar iddia doğru.

2) Ama "hiçbir şey onaylanmıyor" yanlış. `src/app/_layout.tsx:113` ekranı `presentation: "modal"` olarak kaydediyor ve buraya SADECE `src/app/order/[id].tsx:144` ve `:175` üzerinden geliniyor — yani `router.back()` her zaman sipariş biletine döner ve o ekran modal altında mount kalır. `src/hooks/use-reservations.ts` içinde `useCancelReservation.onSuccess` `RESERVATIONS_QUERY_KEY`'i invalidate ediyor; `src/hooks/use-order-details.ts` tam olarak o query'yi (`useReservations()`) okuyor; `src/lib/query-client.ts:15-17` `refetchOnMount: true` ile aktif query'yi hemen yeniden çekiyor. Backend `backend/src/modules/reservations/reservations.service.ts:1165-1176` `listMine`'da hiçbir durum filtresi yok — iptal edilmiş rezervasyon listede KALIR (terminal durumlar sona sıralanır). Sonuç: kullanıcı geri döndüğünde bilet ekranı `SiparisDurumBolumu`'nun son dalına düşer (`src/app/order/[id].tsx:196-200`) ve `<PanelPill label={t("orders.status.CANCELLED_BY_USER")} />` = "İptal edildi" gösterir — `cancel.success`'in ("Siparişin iptal edildi.") söyleyeceği cümlenin aynısı, üstelik 3 saniyelik toast değil kalıcı olarak. Aynı anda "Kepenk aç" ve "Siparişi iptal et" düğmeleri kaybolur; Siparişler'de satır AKTİF'ten GEÇMİŞ'e geçer (`src/app/(tabs)/orders.tsx:16` ACTIVE_STATUSES).

3) Önerilen çare zaten tasarım diline aykırı: `docs/design/consumer-app-spec.md:408` "Full-screen, not a toast"; `src/app/payment/[id].tsx:39` "deliberately NOT a toast and deliberately not a checkmark"; `src/components/teslim/OnayEkrani.tsx:29` "Full-screen, never a toast". Bu uygulamada toast bir idiom değil, bilinçli olarak reddedilmiş bir kalıp.

4) Davranış test tarafından da sabitlenmiş: `src/__tests__/cancel-screen.test.tsx` başarıda `expect(mockBack).toHaveBeenCalled()`, sunucu reddinde `expect(mockBack).not.toHaveBeenCalled()` diyor. "Başarıda pop, hatada satır içi kırmızı" asimetrisi kaza değil, kasıt.

Geriye kalan tek şey `cancel.success`'in ölü kopya olması: iki locale'de de var, parity CI yeşil, hiçbir kullanıcı yanlış bir şey görmüyor. Bu bir temizlik maddesi, kullanıcıya maliyeti olan bir defect değil. "İade yolda" cümlesinin sonradan tekrarlanmaması ise iyileştirme önerisi — kullanıcı `cancel.refundNote`'u onayı verdiği ekranda saniyeler önce okumuştur.

- **(dil-ve-metin) Time units "sa"/"dk"/"gün" are hardcoded in code instead of coming from the `vitrin.*` keys written for them**
  - İddianın OLGUSAL kısmı doğru, SONUÇ kısmı çürüyor. Satır gerçekten iddia edildiği gibi: `/home/tarik/Projects/kurtar/apps/consumer/src/components/kesif/HaritaSatiri.tsx:46` → `const sureEtiketi = durum === "tukendi" ? null : saat > 0 ? `${saat} sa` : `${dakika} dk`;` ve `/home/tarik/Projects/kurtar/apps/consumer/src/lib/format.ts:84-94` (`formatRemaining`) "dk"/"sa"/"gün"ü gömüyor. Ama iki sonucun ikisi de gerçek bir kullanıcıya ulaşmıyor.

(1) "İKİ HAP BİRBİRİNDEN KAYAR" — kendi terimleriyle yanlış. tr.json:441-442 tam olarak `"kalanSaatTam": "{{saat}} sa"`, `"kalanDk": "{{dk}} dk"`. Yani `vitrin.kalanSaatTam` DA dakikayı taşımıyor. Önerilen düzeltme uygulansa harita satırı yine "2 sa" basar — tek piksel değişmez. Kabalık, dizenin nerede durduğundan değil, HaritaSatiri'nin dal şeklinden geliyor (`saat > 0` → yalnız saat; hiç `vitrin.kalanSaat` çağırmıyor). Üstelik bu KASITLI: dosyanın kendi başlık yorumu (satır 7-14) "Deliberately not a shrunk `VitrinKarti`" diyor, spec §4.2 satır 357 bu satırı 180pt sayfa içinde 72pt kompakt satır olarak tanımlıyor, ve hap `minWidth: 52` (HaritaSatiri.tsx:101) iken ZamanHapi'ninki `minWidth: 68` (ZamanHapi.tsx:139). İki hap AYNI EKRANDA hiç görünmüyor da: HaritaSatiri'nin tek montajı `src/app/(tabs)/harita.tsx:125`, VitrinKarti'ninki `src/app/(tabs)/index.tsx:296` — ayrı sekmeler.

(2) "lng 'tr' OLMADIĞI AN" — ulaşılamaz yol. `src/i18n/index.ts:20-21` `lng: "tr"`, `fallbackLng: "tr"`; dosyanın kendi yorumu (satır 7-13) "tr is the only UI language shipped for launch… No device-locale auto-detection". Tüm `src/` ağacında `changeLanguage` çağrısı YALNIZCA `src/__tests__/` içinde (accessibility-i18n, use-order-details-i18n, errors, purchase-screen). `expo-localization` bağımlı değil, tr.json'da dil seçici anahtarı yok. Hiçbir kullanıcı hiçbir yoldan İngilizceye geçemiyor.

(3) BUGÜN TÜRKÇE ÇIKTI BAYT BAYT AYNI. `sureMetni` (kepenk/olcum.ts:137-140) tam sayı döndürüyor; `${saat} sa` ile `t("vitrin.kalanSaatTam", {saat})` ve `${dakika} dk` ile `t("vitrin.kalanDk", {dk})` özdeş karakterleri üretiyor. Hiçbir kullanıcı yanlış hiçbir şey görmüyor — denetimin "which user, doing what, sees what wrong" barajını geçmiyor.

(4) format.ts zaten BİLİNÇLİ Türkiye'ye sabitlenmiş bir katman: satır 1 "Turkish locale throughout (₺ money, tr-TR dates/times)", ve aynı dosyada `formatClockTime`/`formatShortDate` ("12 Ağu") `toLocaleDateString("tr-TR")`, `formatDistance` "m"/"km" + tr-TR ondalık virgülü, `formatKg` tr-TR gömüyor. Üç fonksiyon yukarıda `tr-TR` sabitken yalnız `formatRemaining`'in "dk/sa/gün"ünü JSON'a taşımak dosyayı yerelleştirilebilir yapmaz; o ayrı bir proje.

review-notes-tam-gezinti.md'de ne "verified good" ne de "false alarm" olarak kayıtlı — yani 4. madde bunu çürütmüyor; çürüten 2 ve 3.

DÜRÜSTLÜK NOTU — karşı delil: `src/__tests__/accessibility-i18n.test.tsx:10-23` (M22) tam da bu ilkeyi kayda geçiriyor: "must come from i18n, not from Turkish literals that happen to render identically today". Yani proje bu tercihi biliyor. Ama o test kapsamı erişilebilirlik etiketleri — görsel karşılığı OLMAYAN, ekran okuyucunun tek yolu olan dizeler. Buradaki hap görünür metin ve bugün doğru. Bu bir bakım/hijyen temizliği, kusur değil.

KAPSAM DIŞI AMA KAYDA DEĞER (bu iddia değil, ayrı bir şey): HaritaSatiri `durum === "acilmadi"` dalını hiç ele almıyor (satır 46 yalnız "tukendi"yi eliyor). Henüz açılmamış bir dükkân için ZamanHapi "18:30 açılıyor" derken harita satırı alış BİTİŞİNE kalan süreyi hap olarak basıyor — kullanıcı kapalı dükkânı "3 sa" diye okuyabilir. Bunu bu iddianın parçası olarak saymıyorum; ayrıca doğrulanması gerekir.

---

# Closed out

Every finding above is fixed and merged. Two more were found while fixing
them and are also closed:

- **The tab bar truncated its labels at a raised text scale** — "Favor…",
  "Sipari…" — which loses the Turkish word exactly as the clipped cedilla
  did, by a different route. The bar sizes from the scaled line box and
  renders its own label so it can wrap.
- **The discovery list computed scroll offsets from the 1x card height**,
  so at a large text setting a map pin's `scrollToIndex` landed on the
  wrong shop. Nothing looked wrong: FlatList lays rows out by flex and
  only scrolling reads those numbers.

And one that turned out to be a money hole rather than the UI symptom that
surfaced it (finding 12's root cause):

- **A no-show was never closed and never paid.** `CONFIRMED -> NO_SHOW`
  was a declared edge nothing wrote, and settlement admitted only
  `REDEEMED` — so a customer who paid and did not collect left the
  merchant unpaid for ever, with the money sitting between them. A sweeper
  now closes the window (1h grace, swept every 10 minutes — bounded above
  by the 02:00 batch, since a NO_SHOW written after its batch leaves
  CALCULATED is refused by `recomputeBatch` and would never settle at all)
  and a no-show settles on the same terms as a collected bag, anchored to
  the window it was not collected in.
- **A no-show could not be refunded by any path**, including "the shop was
  shut" — which ends in the same status, because the sweeper cannot tell
  the two apart from the outside. The seeded demo's own
  `STORE_CLOSED_NO_SHOW` complaint was unanswerable. An admin can now
  refund one; no automatic or customer-initiated path can.
- **The admin dashboard's GMV shared one query with the collected count**,
  so it under-reported everything the platform settles on.

## Still open — deliberately

- **No `reservation.no-show.v1` event.** The customer is never told their
  bag was closed out, there is no admin surface listing no-shows, and the
  plan's ≤5% no-show KPI has nothing computing it. This is a feature, not
  a defect, and it drags the DTO → OpenAPI → generated client → admin-web
  chain behind it.
- **`settlement_lines.redeemedAt` is a misnomer** for a no-show line. Not
  renamed: it is the DTO, the OpenAPI schema and the generated client on
  the platform's core money table, and no surface renders it. Documented
  in place.
- **The goodwill coupon** the plan names for a first no-show (§risk 2) is
  unimplemented.
- **Top safe-area inset on Profil and Siparişler** needs measuring on a
  device; the web export cannot show it.

## What the web export cannot verify, ever

Recorded because three separate agents each rediscovered it:
`react-native-web` hard-codes `Dimensions.fontScale = 1`, ignores
`allowFontScaling`/`maxFontSizeMultiplier` entirely, and reports a screen
reader as **always present**. So dynamic type, the drag-vs-press redeem
handle, and any screen-reader-conditional branch cannot be photographed in
a browser. Claims about those rest on unit specs, and a frame that appears
to show them is showing something else.
