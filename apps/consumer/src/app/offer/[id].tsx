import { useMemo } from "react";
import {
  Linking,
  PixelRatio,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { DegerCubugu } from "../../components/kepenk/DegerCubugu";
import {
  degerBandiMetni,
  degerOrani,
  fiyatMetni,
  isikGucu,
  kalanDakika,
  katMetni,
  kepenkP,
  mesafeMetni,
  sureMetni,
  teklifDurumu,
  yurumeDakikasi,
  YURUME_UST_SINIRI_M,
} from "../../components/kepenk/olcum";
import { saatBulunma } from "../../components/kepenk/tr-saat";
import {
  AlisPenceresi,
  Blok,
  BolumBasligi,
  DetayBasligi,
  Dugme,
  DurumEkrani,
  IKON,
  IkonDugmesi,
  YapiskanCubuk,
} from "../../components/teslim";
import { useReduceMotion } from "../../design/reduce-motion";
import { useSimdi } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { useStoreProfile } from "../../hooks/use-discovery";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { CANCEL_DEADLINE_BEFORE_PICKUP_MS } from "../../lib/constants";
import { formatClockTime } from "../../lib/format";

const IPTAL_SAATI = CANCEL_DEADLINE_BEFORE_PICKUP_MS / (60 * 60 * 1000);

/** The landing app's own default origin (landing/lib/site-config.ts), so
 * a shared link lands on the universal-link bridge page rather than
 * nowhere. */
const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://kurtar.app";

/** The button interior a 390pt phone hands each of the two secondary
 * actions at 1×, and the width the longest shipped label was drawn
 * against. Below it the pair stacks. */
const DUGME_ICI_TABANI = 141;

/**
 * TEKLİF DETAYI — spec §4.3.
 *
 * The same storefront as the list card, at the size a shop is when you
 * have stopped walking: an 8pt awning, a 128pt kepenk band, the sign at
 * `tabela.xl`. Then the honest answer to "what's in it?" — the shop's own
 * categories and the one sentence where this app explains its own
 * constraint — then the money, the window, the walk, and a sticky
 * `KUTUYU AYIR`.
 *
 * There is no photograph and no logo, here or anywhere: the hashed awning
 * and the category glyph ARE the identity system, and the moment one
 * offer has an image the whole system reads as broken (§5.15). The cover
 * image this screen used to render is gone for exactly that reason.
 */
export default function TeklifDetayiEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const simdi = useSimdi();
  const azaltHareket = useReduceMotion();
  const { width } = useWindowDimensions();
  // The two quiet actions sit side by side only while a label measurably
  // fits on one line inside half the row. `yazi.label` is Archivo 500 12
  // with +0.9 tracking and `Dugme` clips at `numberOfLines={1}`, so
  // "HARİTADA GÖSTER" is 128pt against the 141pt interior a 390pt phone
  // gives at 1× — no margin at all, and none of it survives the text
  // scale (162pt at the label's own 1.3 ceiling) or a 360pt phone
  // (126pt of interior). Where the row cannot hold a label, the row is
  // what gives: stacked, each button gets the full content width, which
  // is roughly twice what the longest label in any locale asks for.
  const dugmeIci = (width - 2 * s.s4 - s.s3) / 2 - 2 * s.s4;
  const yanYana = PixelRatio.getFontScale() <= 1 && dugmeIci >= DUGME_ICI_TABANI;
  const { id, storeId, distanceM } = useLocalSearchParams<{
    id: string;
    storeId: string;
    distanceM?: string;
  }>();

  const dukkanSorgusu = useStoreProfile(storeId ?? null);
  const teklif = dukkanSorgusu.data?.todaysOffers.find((o) => o.offerId === id);

  const favoriler = useFavorites();
  const favoriDegistir = useToggleFavorite();
  const favori =
    favoriler.data?.items.some((f) => f.store.id === storeId) ?? false;

  const govdeGenisligi = Math.min(width, 430) - 2 * s.s4;

  const olcum = useMemo(() => {
    if (!teklif) return null;
    const baslangic = new Date(teklif.pickupStartAt);
    const bitis = new Date(teklif.pickupEndAt);
    const durum = teklifDurumu(teklif.qtyLeft, baslangic, bitis, simdi);
    const kalanDk = kalanDakika(simdi, bitis);
    const p = kepenkP(kalanDk, durum);
    return {
      baslangic,
      bitis,
      durum,
      kalanDk,
      p,
      guc: isikGucu(p, durum),
      oran: degerOrani(
        teklif.template.originalValueCentsMin,
        teklif.template.originalValueCentsMax,
        teklif.template.priceCents,
      ),
    };
  }, [simdi, teklif]);

  if (dukkanSorgusu.isLoading) {
    return <DurumEkrani tur="yukleniyor" baslik={t("common.loading")} />;
  }

  if (!teklif || !dukkanSorgusu.data || !olcum) {
    return (
      <DurumEkrani
        tur="hata"
        baslik={t("offerDetail.loadError")}
        eylemEtiketi={t("dugme.kesfet")}
        onEylem={() => router.replace("/(tabs)")}
      />
    );
  }

  const dukkan = dukkanSorgusu.data.store;
  const puan = dukkanSorgusu.data.rating;
  const { baslangic, bitis, durum, kalanDk, p, guc, oran } = olcum;
  const acilisSaati = saatBulunma(formatClockTime(baslangic));
  const mesafe = distanceM ? Number(distanceM) : null;
  const tukendi = durum === "tukendi";
  const acilmadi = durum === "acilmadi";

  const { saat, dakika } = sureMetni(kalanDk);
  // The compact form the time pill uses ("1 sa 39 dk"), not the spelled
  // out one the screen reader gets.
  const kalanMetni =
    saat === 0
      ? t("vitrin.kalanDk", { dk: dakika })
      : dakika === 0
        ? t("vitrin.kalanSaatTam", { saat })
        : t("vitrin.kalanSaat", { saat, dk: dakika });

  // The API's own enums, spoken: `categoryTags` and `dietFlags` are
  // BagCategory/DietFlag values, and printing "PRODUCE" inside a Turkish
  // sentence is the tell of a screen that never read its own data.
  const etiketler = [
    ...new Set([
      ...(dukkan.categoryTags ?? []).map((etiket) =>
        t(`discover.categories.${etiket}`, { defaultValue: etiket }),
      ),
      ...(teklif.template.dietFlags ?? []).map((bayrak) =>
        t(`discover.diet.${bayrak}`, { defaultValue: bayrak }),
      ),
    ]),
  ];

  const cta = tukendi
    ? t("dugme.tukendi")
    : acilmadi
      ? t("dugme.acilmadi")
      : t("dugme.kutuyuAyir", { fiyat: fiyatMetni(teklif.template.priceCents) });

  const paylas = () => {
    void Share.share({
      message: t("teklif.paylasMetni", {
        dukkan: dukkan.name,
        baglanti: `${SITE}/tr/o/${teklif.offerId}`,
      }),
    }).catch(() => undefined);
  };

  const haritayaGit = () =>
    router.push({ pathname: "/store/[id]", params: { id: dukkan.id } });

  const yolTarifi = () => {
    const hedef = encodeURIComponent(
      [dukkan.name, dukkan.address, dukkan.district].filter(Boolean).join(", "),
    );
    void Linking.openURL(
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${hedef}`
        : `geo:0,0?q=${hedef}`,
    ).catch(() => undefined);
  };

  return (
    <SafeAreaView
      style={[styles.kok, { backgroundColor: palet.bgAsfalt }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.ustCubuk}>
        <IkonDugmesi
          yol={IKON.geri}
          etiket={t("common.back")}
          onPress={() => router.back()}
          palet={palet}
          zemin="sokak"
          testID="teklif-geri"
        />
        <View style={styles.esnek} />
        <IkonDugmesi
          yol={IKON.kalp}
          etiket={favori ? t("storeProfile.unfavoriteCta") : t("storeProfile.favoriteCta")}
          doldur={favori}
          onPress={() =>
            favoriDegistir.mutate({ storeId: dukkan.id, isFavorite: favori })
          }
          palet={palet}
          zemin="sokak"
          testID="teklif-favori"
        />
        <IkonDugmesi
          yol={IKON.paylas}
          etiket={t("teklif.paylas")}
          onPress={paylas}
          palet={palet}
          zemin="sokak"
          testID="teklif-paylas"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.icerik}
        showsVerticalScrollIndicator={false}
      >
        <DetayBasligi
          genislik={govdeGenisligi}
          dukkanId={dukkan.id}
          dukkanAdi={dukkan.name}
          kategori={teklif.template.category}
          p={p}
          guc={guc}
          durum={durum}
          kalanDk={kalanDk}
          acilisSaati={acilisSaati}
          kalanAdet={teklif.qtyLeft}
          meta={[t(`discover.categories.${teklif.template.category}`, {
            defaultValue: teklif.template.category,
          }), [dukkan.district, dukkan.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
          puan={
            puan.count > 0
              ? t("teklif.puan", {
                  puan: puan.average.toLocaleString("tr-TR", {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  }),
                  adet: puan.count,
                })
              : null
          }
          palet={palet}
          azaltHareket={azaltHareket}
        />

        <View style={styles.bolum}>
          <BolumBasligi etiket={t("teklif.vitrinBaslik")} palet={palet} />
          <Text
            style={[yazi.paket, { color: palet.yaziAnaZemin }]}
            maxFontSizeMultiplier={1.5}
          >
            {teklif.template.title}
          </Text>
          {etiketler.length > 0 ? (
            <Text
              style={[yazi.body, styles.aralikli, { color: palet.yaziSisZemin }]}
              maxFontSizeMultiplier={1.5}
            >
              {etiketler.join(" · ")}
            </Text>
          ) : null}
          {/* The one place the app explains its own constraint, in plain
              Turkish, once. */}
          <Text
            style={[yazi.body, styles.aralikli, { color: palet.yaziSisZemin }]}
            maxFontSizeMultiplier={1.5}
          >
            {t("teklif.vitrinAciklama")}
          </Text>
        </View>

        <View style={styles.bolum}>
          <View style={styles.fiyatSatiri}>
            <Text
              style={[yazi.priceXl, { color: palet.sodyumYaziZemin }]}
              maxFontSizeMultiplier={1.3}
            >
              {fiyatMetni(teklif.template.priceCents)}
            </Text>
            <View style={styles.cubukYuvasi}>
              <DegerCubugu oran={oran} palet={palet} etiket={false} />
            </View>
            <Text
              style={[yazi.micro, { color: palet.sodyumYaziZemin }]}
              maxFontSizeMultiplier={1.3}
            >
              {t("vitrin.kat", { kat: katMetni(oran) })}
            </Text>
          </View>
          <Text
            style={[yazi.data, { color: palet.yaziSisZemin }]}
            maxFontSizeMultiplier={1.3}
          >
            {t("vitrin.degerBandi", {
              band: degerBandiMetni(
                teklif.template.originalValueCentsMin,
                teklif.template.originalValueCentsMax,
              ),
            })}
          </Text>
        </View>

        <View style={styles.bolum}>
          <BolumBasligi etiket={t("teklif.alisPenceresi")} palet={palet} />
          <Blok palet={palet} vurgu>
            <AlisPenceresi
              simdiMs={simdi.getTime()}
              baslangicMs={baslangic.getTime()}
              bitisMs={bitis.getTime()}
              baslangic={formatClockTime(baslangic)}
              bitis={formatClockTime(bitis)}
              simdi={t("teklif.simdi", { saat: formatClockTime(simdi) })}
              gun={t("teklif.bugun")}
              cumle={
                tukendi
                  ? t("teklif.kepenkIndi")
                  : acilmadi
                    ? t("teklif.kepenkKalkiyor", { saat: acilisSaati })
                    : t("teklif.kepenkIniyor", { sure: kalanMetni })
              }
              palet={palet}
            />
          </Blok>
        </View>

        <View style={styles.bolum}>
          <BolumBasligi
            etiket={t("teklif.yuruyus")}
            palet={palet}
            sag={
              mesafe !== null
                ? [
                    mesafe <= YURUME_UST_SINIRI_M
                      ? t("vitrin.kalanDk", { dk: yurumeDakikasi(mesafe) })
                      : null,
                    mesafeMetni(mesafe),
                  ]
                    .filter((parca): parca is string => parca !== null)
                    .join(" · ")
                : undefined
            }
          />
          <Text
            style={[yazi.body, { color: palet.yaziAnaZemin }]}
            maxFontSizeMultiplier={1.5}
          >
            {dukkan.address}
          </Text>
          <View style={[styles.ikiDugme, yanYana ? null : styles.dugmelerDik]}>
            <View style={styles.esnek}>
              <Dugme
                etiket={t("dugme.haritadaGoster")}
                onPress={haritayaGit}
                palet={palet}
                ikincil
                zemin="sokak"
                testID="teklif-harita"
              />
            </View>
            <View style={styles.esnek}>
              <Dugme
                etiket={t("dugme.yolTarifi")}
                onPress={yolTarifi}
                palet={palet}
                ikincil
                zemin="sokak"
                testID="teklif-yol"
              />
            </View>
          </View>
        </View>

        {/* Legally mandatory and therefore never dropped for layout: the
            merchant's OWN allergen text, collected at submit, and the
            cancellation rule. */}
        <View style={styles.bolum}>
          <BolumBasligi etiket={t("teklif.alerjen")} palet={palet} />
          <Blok palet={palet}>
            <Text
              style={[yazi.body, { color: palet.yaziAna }]}
              maxFontSizeMultiplier={1.5}
            >
              {teklif.template.allergenDisclaimer.trim().length > 0
                ? teklif.template.allergenDisclaimer
                : t("offerDetail.allergenBody")}
            </Text>
          </Blok>
        </View>

        <View style={styles.bolum}>
          <BolumBasligi etiket={t("teklif.iade")} palet={palet} />
          <Text
            style={[yazi.body, { color: palet.yaziSisZemin }]}
            maxFontSizeMultiplier={1.5}
          >
            {t("offerDetail.noRefundBody", { hours: IPTAL_SAATI })}
          </Text>
        </View>
      </ScrollView>

      <YapiskanCubuk palet={palet}>
        <Dugme
          etiket={cta}
          altEtiket={
            tukendi
              ? undefined
              : acilmadi
                ? t("vitrin.acilis", { saat: acilisSaati })
                : t("teklif.kalanPaket", { adet: teklif.qtyLeft })
          }
          pasif={tukendi || acilmadi}
          onPress={() =>
            router.push({
              pathname: "/purchase/[offerId]",
              params: { offerId: teklif.offerId, storeId: dukkan.id },
            })
          }
          palet={palet}
          testID="offer-buy-cta"
        />
      </YapiskanCubuk>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  ustCubuk: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: s.s2,
    paddingVertical: s.s1,
  },
  esnek: { flex: 1 },
  icerik: { paddingHorizontal: s.s4, paddingBottom: s.s10, gap: s.s6 },
  bolum: { gap: s.s2 },
  aralikli: { marginTop: s.s1 },
  fiyatSatiri: { flexDirection: "row", alignItems: "center", gap: s.s3 },
  cubukYuvasi: { flex: 1 },
  ikiDugme: { flexDirection: "row", gap: s.s3, marginTop: s.s2 },
  /** Same gap, one under the other — each label gets the full content
   * width instead of half of it. */
  dugmelerDik: { flexDirection: "column" },
});
