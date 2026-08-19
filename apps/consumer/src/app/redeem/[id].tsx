import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fiyatMetni } from "../../components/kepenk/olcum";
import { saatBulunma } from "../../components/kepenk/tr-saat";
import {
  ACIK_KALMA_SN,
  AcikDukkan,
  CanliSaat,
  DurumEkrani,
  Dugme,
  HeroTabela,
  IKON,
  IkonDugmesi,
  INIS_SURESI,
  KepenkKolu,
  Kod,
  TamKepenk,
  TeslimSeli,
  kepenkIniyorMu,
  kapanmayaDk,
  kodHeceleme,
  kodParcalari,
  pencereDurumu,
  tikSayisi,
  tikZamanlari,
  useEkranOkuyucu,
  yerBulunma,
} from "../../components/teslim";
import { egri, YERLI_SURUCU } from "../../design/motion";
import { useReduceMotion } from "../../design/reduce-motion";
import { useSaniyeTiki } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi } from "../../design/tokens";
import { useOrderDetails } from "../../hooks/use-order-details";
import { useRedeemReconciliation } from "../../hooks/use-redeem-reconciliation";
import { client } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/errors";
import {
  formatClockTime,
  formatClockWithSeconds,
  formatPickupWindow,
} from "../../lib/format";
import { useTezgahModu } from "../../lib/parlaklik";

/**
 * KEPENK — redeem, the defining interaction (spec §4.5).
 *
 * The customer holds the phone up; a stranger behind a counter has three
 * seconds and bad lighting. Three jobs: be unmistakably this app, prove
 * it is live, and end in a moment worth the walk.
 *
 * **State A — closed.** Full-bleed zinc under an UNLIT sign. No code, no
 * clock, no order. Screenshot it and you have a picture of a closed shop:
 * the code does not exist on screen until the swipe happens, which is a
 * structural anti-fraud property rather than a cosmetic one, and the
 * reason this beats a static QR.
 *
 * **The swipe.** ≥140pt up. Brightness to 1.0 and auto-lock off (see
 * lib/parlaklik.ts). The shutter rolls over 700ms with haptic ticks at
 * decelerating intervals — nine on iOS, three on Android, because nine
 * inside 700ms smear into one buzz on an ERM motor. The ticks are
 * scheduled from JS as absolute timestamps taken at release, so they do
 * not drift against the UI-thread animation, and the last one is `Medium`
 * and lands exactly when the sign lights.
 *
 * **State B — open, ordered by the STAFF MEMBER's task, not the
 * customer's:** shop name largest (staff verify "this is us" first,
 * always), then the live clock and its sweep, then the code, then the
 * order, then the button.
 *
 * **It is never one-shot.** The open state lasts 30 seconds and rolls
 * back down by itself with no haptics; re-swipe as many times as needed.
 * Nothing is more hostile than a redeem screen you can accidentally burn.
 *
 * The state machine underneath (`use-redeem-reconciliation.ts`) is
 * unchanged: the direct `POST /reservations/:id/redeem` is the primary
 * path, a genuine server refusal is surfaced with ITS OWN reason, and only
 * an unreachable server falls back to the local queue that staff
 * reconcile from their side.
 */
export default function KepenkEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const azaltHareket = useReduceMotion();
  const ekranOkuyucu = useEkranOkuyucu();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading } = useOrderDetails(id ?? "");
  const {
    queued,
    queueChecked,
    confirm,
    redeeming,
    reconciled,
    redeemedAt,
    isOffline,
  } = useRedeemReconciliation(id ?? "");
  const [hata, setHata] = useState<string | null>(null);

  // The 1Hz rail — the ONE thing on this screen that is exempt from
  // reduced motion, because it is proof rather than decoration. Mounting
  // this hook is what starts the interval; nothing else in the app pays
  // for it.
  const simdiMs = useSaniyeTiki();

  // WHEN it was opened, not how many seconds are left: a per-tick
  // decrement drifts the moment a render is batched or the JS thread is
  // busy, and this counter is the thing that decides when the shutter
  // comes back down in front of a shop worker.
  const [acildiMs, setAcildiMs] = useState<number | null>(null);
  const [selBitti, setSelBitti] = useState(false);
  // Seeded from the window rather than left null until `onLayout`: the
  // shutter has to be down on the FIRST frame, not the second. A frame of
  // bare screen before the metal arrives is a frame of open shop that
  // nobody opened.
  const [vitrinOlcusu, setVitrinOlcusu] = useState({ width, height });
  const konum = useRef(new Animated.Value(0)).current;
  const tikTimerlari = useRef<ReturnType<typeof setTimeout>[]>([]);

  useTezgahModu(true);

  const tiklariTemizle = useCallback(() => {
    for (const zamanlayici of tikTimerlari.current) clearTimeout(zamanlayici);
    tikTimerlari.current = [];
  }, []);

  useEffect(() => tiklariTemizle, [tiklariTemizle]);

  const indir = useCallback(() => {
    setAcildiMs(null);
    tiklariTemizle();
    if (azaltHareket === true) {
      konum.setValue(0);
      return;
    }
    // No haptics on the way down: the shutter closing is not news.
    Animated.timing(konum, {
      toValue: 0,
      duration: INIS_SURESI,
      easing: egri.base,
      useNativeDriver: YERLI_SURUCU,
    }).start();
  }, [azaltHareket, konum, tiklariTemizle]);

  const kaldir = useCallback(() => {
    setHata(null);

    // Absolute timestamps taken at release, so a busy JS thread shifts a
    // tick rather than compounding the error across all of them.
    tiklariTemizle();
    const adet = tikSayisi();
    const zamanlar = tikZamanlari(adet);
    const t0 = Date.now();
    setAcildiMs(t0);
    zamanlar.forEach((ofset, i) => {
      const hedef = t0 + ofset;
      tikTimerlari.current.push(
        setTimeout(
          () => {
            if (Platform.OS === "web") return;
            void Haptics.impactAsync(
              i === adet - 1
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => undefined);
          },
          Math.max(0, hedef - Date.now()),
        ),
      );
    });

    if (azaltHareket === true) {
      // The ritual survives, the movement doesn't — and the haptics are
      // unchanged (spec §2 Degradation).
      konum.setValue(1);
      return;
    }
    Animated.timing(konum, {
      toValue: 1,
      duration: m.roll,
      easing: egri.roll,
      useNativeDriver: YERLI_SURUCU,
    }).start();
  }, [azaltHareket, konum, tiklariTemizle]);

  const acik = acildiMs !== null;
  // The 30-second window, read off the same 1Hz rail as the clock rather
  // than counted down by hand.
  const kalanSn =
    acildiMs === null
      ? ACIK_KALMA_SN
      : Math.max(0, ACIK_KALMA_SN - Math.floor((simdiMs - acildiMs) / 1000));

  useEffect(() => {
    if (acik && kalanSn <= 0) indir();
  }, [acik, indir, kalanSn]);

  const kilitliDeneme = useCallback(() => {
    if (Platform.OS === "web") return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined,
    );
  }, []);

  const teslimAldim = () => {
    setHata(null);
    confirm().catch((err: unknown) => setHata(getErrorMessage(err, t)));
  };

  const basarili = data?.reservation.status === "REDEEMED" || reconciled;

  // The impact line — read AFTER the handover, never fabricated. If the
  // ledger has not caught up yet the line is simply absent.
  const etki = useQuery({
    queryKey: ["impact", "mine"],
    queryFn: () => client.impact.getMine(),
    enabled: basarili,
    staleTime: 60_000,
  });

  // One live region on open: shop, then the code CHARACTER BY CHARACTER,
  // then the item. A screen reader given "K-7F3M" says nothing useful.
  const duyuruldu = useRef(false);
  useEffect(() => {
    if (!acik || !data) {
      if (!acik) duyuruldu.current = false;
      return;
    }
    if (duyuruldu.current) return;
    duyuruldu.current = true;
    AccessibilityInfo.announceForAccessibility(
      t("kepenk.acikDuyuru", {
        dukkan: data.storeName,
        kod: kodHeceleme(data.reservation.code),
        paket: data.bagTitle ?? t("kepenk.paketBilinmiyor"),
      }),
    );
  }, [acik, data, t]);

  if (isLoading || !queueChecked) {
    return <DurumEkrani tur="yukleniyor" baslik={t("common.loading")} />;
  }

  if (!data) {
    return (
      <DurumEkrani
        tur="hata"
        baslik={t("redeem.notRedeemableTitle")}
        eylemEtiketi={t("dugme.geriDon")}
        onEylem={() => router.back()}
      />
    );
  }

  const rezervasyon = data.reservation;
  const baslangicMs = new Date(data.pickupStartAt).getTime();
  const bitisMs = new Date(data.pickupEndAt).getTime();
  const pencere = pencereDurumu(simdiMs, baslangicMs, bitisMs);
  const teslimEdilebilir = rezervasyon.status === "CONFIRMED";

  // A window that has closed on an unqueued reservation is not a shutter
  // you can push at all — that is the empty state, not a locked handle.
  if (!basarili && (!teslimEdilebilir || (pencere === "kapandi" && queued === null))) {
    return (
      <DurumEkrani
        tur="kapali"
        baslik={t("redeem.notRedeemableTitle")}
        govde={t("redeem.notRedeemableBody")}
        eylemEtiketi={t("dugme.siparisiGor")}
        onEylem={() =>
          router.replace({ pathname: "/order/[id]", params: { id } })
        }
      />
    );
  }

  if (basarili) {
    const an = rezervasyon.redeemedAt ?? redeemedAt;
    const saat = an ? formatClockWithSeconds(new Date(an)) : formatClockTime(new Date(simdiMs));
    return (
      <View style={[styles.kok, { backgroundColor: palet.bgDerin }]}>
        <SafeAreaView style={styles.kok} edges={["top", "bottom", "left", "right"]}>
          <View style={styles.basariGovdesi}>
            <HeroTabela
              ad={data.storeName}
              palet={palet}
              yanik
              genislik={width - 2 * s.s4}
            />
            <Text
              style={[yazi.dataLg, styles.ortali, { color: palet.sodyumYazi }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("kepenk.odendi", {
                fiyat: fiyatMetni(rezervasyon.totalCents),
                kod: rezervasyon.code,
              })}
            </Text>
            <Text
              style={[yazi.body, styles.ortali, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.4}
            >
              {t("kepenk.adetPaket", {
                adet: rezervasyon.qty,
                paket: data.bagTitle ?? t("kepenk.paketBilinmiyor"),
              })}
            </Text>
            <Text
              style={[yazi.dataLg, styles.ortali, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.3}
            >
              {saat}
            </Text>
            {etki.data && data.storeDistrict ? (
              <Text
                style={[yazi.dataLg, styles.ortali, { color: palet.sodyumYazi }]}
                testID="kepenk-etki"
                maxFontSizeMultiplier={1.3}
              >
                {t("kepenk.etkiSatiri", {
                  yer: yerBulunma(data.storeDistrict),
                  sira: etki.data.count,
                })}
              </Text>
            ) : null}
          </View>

          <View style={styles.basariEylemi}>
            <Dugme
              etiket={t("dugme.degerlendir")}
              onPress={() =>
                router.replace({ pathname: "/rate/[id]", params: { id } })
              }
              palet={palet}
              testID="kepenk-degerlendir"
            />
            <View style={styles.ikincil}>
              <Dugme
                etiket={t("dugme.siparislerim")}
                onPress={() => router.replace("/(tabs)/orders")}
                palet={palet}
                ikincil
                testID="kepenk-bitti"
              />
            </View>
          </View>
        </SafeAreaView>

        {!selBitti ? (
          <TeslimSeli
            dukkanAdi={data.storeName}
            paketAdi={data.bagTitle}
            saat={saat}
            azaltHareket={azaltHareket}
            onBitti={() => setSelBitti(true)}
          />
        ) : null}
      </View>
    );
  }

  const kilitli = pencere !== "acik";
  const iniyor = kepenkIniyorMu(simdiMs, bitisMs);
  const kolGenisligi = Math.min(width - 2 * s.s4, 358);
  const kodParcasi = kodParcalari(rezervasyon.code);
  const cevrimdisi = queued !== null && isOffline;
  const bekliyor = queued !== null && !isOffline;

  const uyariMetni = kilitli
    ? pencere === "acilmadi"
      ? t("kepenk.acilir", { saat: saatBulunma(formatClockTime(data.pickupStartAt)) })
      : t("kepenk.kapandi", { saat: saatBulunma(formatClockTime(data.pickupEndAt)) })
    : iniyor
      ? t("kepenk.iniyor", { dk: kapanmayaDk(simdiMs, bitisMs) })
      : null;

  return (
    <View style={[styles.kok, { backgroundColor: palet.bgDerin }]} testID="kepenk-ekrani">
      <SafeAreaView style={styles.kok} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.ustCubuk}>
          <IkonDugmesi
            yol={IKON.geri}
            etiket={t("common.back")}
            onPress={() => router.back()}
            palet={palet}
            testID="kepenk-geri"
          />
          {uyariMetni ? (
            <View
              testID="kepenk-uyari"
              style={[styles.uyari, { backgroundColor: palet.tenteDolgu }]}
            >
              <Text
                style={[yazi.cipAlarm, { color: palet.tenteMurekkep }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {uyariMetni}
              </Text>
            </View>
          ) : (
            <View style={styles.ikonBosluk} />
          )}
          <View style={styles.ikonBosluk} />
        </View>

        {/* The sign is above the opening, architecturally, so the shutter
            can never reach it — the same rule the offer card obeys. It is
            unlit until the metal moves. */}
        <HeroTabela
          ad={data.storeName}
          palet={palet}
          yanik={acik}
          genislik={width - 2 * s.s4}
        />
        {data.storeDistrict ? (
          <Text
            style={[yazi.data, styles.ortali, { color: palet.yaziSis }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {data.storeDistrict}
          </Text>
        ) : null}

        <View
          style={styles.vitrin}
          onLayout={(olay) => {
            const { width: g, height: y } = olay.nativeEvent.layout;
            setVitrinOlcusu((onceki) =>
              onceki.width === g && onceki.height === y ? onceki : { width: g, height: y },
            );
          }}
        >
          {/* The shop itself. It is drawn FIRST because everything else
              in this box is inside it: the metal is in front of the room,
              and the code is written on the light. */}
          <AcikDukkan
            genislik={vitrinOlcusu.width}
            yukseklik={vitrinOlcusu.height}
            palet={palet}
          />

          {/* Everything below exists only once the shutter is up. It is
              mounted only then, so a screenshot of the closed state
              cannot contain it at all. */}
          {acik ? (
            <View style={styles.acikIcerik} testID="kepenk-acik">
              <CanliSaat
                genislik={kolGenisligi}
                palet={palet}
                azaltHareket={azaltHareket}
              />
              <Text
                style={[yazi.data, styles.ortali, { color: palet.yaziSis }]}
                maxFontSizeMultiplier={1.3}
              >
                {new Date(simdiMs).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "long",
                  weekday: "long",
                  timeZone: "Europe/Istanbul",
                })}
              </Text>

              <View style={styles.kodAlani}>
                <Kod kod={rezervasyon.code} palet={palet} />
              </View>

              {/* The depth of the shop. The two dense groups sit where
                  the light is — the code held up in the lamp, the ticket
                  down on the counter — and the slack between them is the
                  room rather than a gap in a layout. */}
              <View style={styles.derinlik} />

              <View style={[styles.ayrac, { backgroundColor: palet.cizgiKil }]} />

              <Text
                style={[yazi.body, styles.ortali, { color: palet.yaziAna }]}
                maxFontSizeMultiplier={1.4}
              >
                {t("kepenk.adetPaket", {
                  adet: rezervasyon.qty,
                  paket: data.bagTitle ?? t("kepenk.paketBilinmiyor"),
                })}
              </Text>
              <Text
                style={[yazi.dataLg, styles.ortali, { color: palet.sodyumYazi }]}
                maxFontSizeMultiplier={1.3}
              >
                {t("kepenk.odendi", {
                  fiyat: fiyatMetni(rezervasyon.totalCents),
                  kod: kodParcasi.tam,
                })}
              </Text>
              <Text
                testID="kepenk-sayac"
                style={[yazi.data, styles.ortali, { color: palet.yaziSis }]}
                maxFontSizeMultiplier={1.3}
              >
                {t("kepenk.kapanisSayaci", { sn: kalanSn })}
              </Text>

              {cevrimdisi ? (
                <Text
                  testID="kepenk-cevrimdisi"
                  style={[
                    yazi.body,
                    styles.bildirim,
                    { backgroundColor: palet.yuzeyKaldirim, color: palet.yaziAna },
                  ]}
                  maxFontSizeMultiplier={1.4}
                >
                  {t("redeem.offlineBody")}
                </Text>
              ) : bekliyor ? (
                <Text
                  style={[yazi.body, styles.ortali, { color: palet.yaziSis }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {t("redeem.waitingForStaff")}
                </Text>
              ) : null}

              {hata ? (
                <Text
                  testID="kepenk-hata"
                  style={[
                    yazi.bodyStrong,
                    styles.bildirim,
                    { backgroundColor: palet.tenteDolgu, color: palet.tenteMurekkep },
                  ]}
                  maxFontSizeMultiplier={1.4}
                >
                  {hata}
                </Text>
              ) : null}

              <View style={[styles.eylem, { width: kolGenisligi }]}>
                <Dugme
                  etiket={t("dugme.teslimAldim")}
                  onPress={teslimAldim}
                  pasif={redeeming || queued !== null}
                  palet={palet}
                  testID="kepenk-teslim-aldim"
                />
                {/* A thumb slips in a queue. Putting the shutter back down
                    costs nothing and commits nothing — no server call has
                    happened yet at this point. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={indir}
                  testID="kepenk-yanlislikla"
                  style={({ pressed }) => [
                    styles.geriAl,
                    pressed ? { opacity: m.pressOpacity } : null,
                  ]}
                >
                  <Text style={[yazi.body, { color: palet.yaziSis }]}>
                    {t("kepenk.yanlislikla")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.kapaliBilgi} pointerEvents="none">
              <Text
                style={[yazi.data, styles.ortali, { color: palet.yaziSis }]}
                maxFontSizeMultiplier={1.3}
              >
                {formatPickupWindow(data.pickupStartAt, data.pickupEndAt)}
              </Text>
            </View>
          )}

          {/* The metal covers the OPENING and nothing else: the sign is
              above it architecturally, which is why the card needs a
              0.78 cap and this screen needs none (§5.13). Its travel is
              the opening's own height, measured rather than assumed, so
              the lip lands on the sill. */}
          <TamKepenk
            genislik={vitrinOlcusu.width}
            yukseklik={vitrinOlcusu.height}
            konum={konum}
            palet={palet}
            kilitli={kilitli}
            kol={
              <View style={styles.kolYuvasi}>
                <KepenkKolu
                  genislik={kolGenisligi}
                  yukseklik={vitrinOlcusu.height}
                  konum={konum}
                  palet={palet}
                  kilitli={kilitli}
                  kilitAltEtiketi={formatPickupWindow(
                    data.pickupStartAt,
                    data.pickupEndAt,
                  )}
                  azaltHareket={azaltHareket}
                  ekranOkuyucu={ekranOkuyucu}
                  onKaldir={kaldir}
                  onKilitliDeneme={kilitliDeneme}
                />
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  ustCubuk: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: s.s2,
    paddingVertical: s.s1,
  },
  ikonBosluk: { width: 40 },
  uyari: {
    borderRadius: r.pill,
    paddingHorizontal: s.s3,
    paddingVertical: s.s1,
    flexShrink: 1,
  },
  vitrin: { flex: 1, justifyContent: "flex-start", overflow: "hidden" },
  // The staff member's reading order runs top to bottom and the button is
  // the last thing in it, so the group fills the opening and the action
  // sits at the bottom of the frame rather than floating in the middle of
  // it with a third of the screen empty underneath.
  acikIcerik: {
    flex: 1,
    alignItems: "center",
    gap: s.s2,
    paddingHorizontal: s.s4,
    paddingTop: s.s6,
  },
  kapaliBilgi: { alignItems: "center", paddingTop: s.s6 },
  ortali: { textAlign: "center" },
  kodAlani: { marginTop: s.s3 },
  ayrac: { height: 1, alignSelf: "stretch", marginVertical: s.s3 },
  bildirim: {
    padding: s.s3,
    borderRadius: r.card,
    overflow: "hidden",
    textAlign: "center",
  },
  derinlik: { flexGrow: 1, flexShrink: 1 },
  eylem: { paddingTop: s.s4, alignItems: "stretch" },
  geriAl: { alignSelf: "center", paddingVertical: s.s3, paddingHorizontal: s.s4 },
  kolYuvasi: { alignItems: "center" },
  basariGovdesi: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s4,
    gap: s.s3,
  },
  basariEylemi: { paddingHorizontal: s.s4, paddingBottom: s.s4 },
  ikincil: { marginTop: s.s3 },
});
