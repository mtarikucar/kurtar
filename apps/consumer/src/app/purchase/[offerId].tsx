import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { fiyatMetni } from "../../components/kepenk/olcum";
import type { VitrinTeklifi } from "../../components/kepenk/VitrinKarti";
import {
  Blok,
  BolumBasligi,
  Dugme,
  DurumEkrani,
  IKON,
  IkonDugmesi,
  YapiskanCubuk,
} from "../../components/teslim";
import { KapandiEkrani } from "../../components/teslim/KapandiEkrani";
import { teklifeCevir } from "../../components/teslim/eslestir";
import { useReduceMotion } from "../../design/reduce-motion";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi, type Palet } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { useDiscoveryOffers, useStoreProfile } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import { ISTANBUL_DISTRICTS } from "../../lib/location";
import {
  isOfferUnavailableError,
  useCreateReservation,
} from "../../hooks/use-reservations";
import { getErrorMessage } from "../../lib/errors";
import { formatPickupWindow } from "../../lib/format";
import { savePurchaseSnapshot } from "../../lib/purchase-cache";

const EN_FAZLA_ADET = 5;
/** Wide enough that "the nearest alternative" is genuinely near. */
const ALTERNATIF_YARICAP_M = 5000;

/**
 * SATIN ALMA — the money path (spec §4.4).
 *
 * The stock claim is atomic server-side and CAN legitimately lose the
 * race; `OFFER_UNAVAILABLE` is common at drop time, not exceptional. That
 * branch is `<KapandiEkrani/>`: a shutter slamming down and the nearest
 * alternative, never a dead-end alert.
 *
 * The pre-contract gate is unchanged and non-negotiable — this is the one
 * place a Turkish consumer forms a distance contract, so the ÖBF/MSS
 * links and the unchecked-by-default acknowledgement stay exactly as
 * they were, restyled and no weaker.
 */
export default function SatinAlmaEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const azaltHareket = useReduceMotion();

  const { offerId, storeId } = useLocalSearchParams<{
    offerId: string;
    storeId: string;
  }>();

  const dukkanSorgusu = useStoreProfile(storeId ?? null);
  const teklif = dukkanSorgusu.data?.todaysOffers.find(
    (o) => o.offerId === offerId,
  );

  const [adet, setAdet] = useState(1);
  const [kapandi, setKapandi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [onay, setOnay] = useState(false);
  const rezervasyon = useCreateReservation();

  // Only fetched once the race has actually been lost, so the ordinary
  // path never pays for it.
  const { coords } = useEffectiveLocation();
  // A denied location must not turn §4.4's "and here is the nearest
  // alternative" into the dead end §4.4 exists to prevent. The shop's OWN
  // district centre is the honest fallback anchor: it is where the
  // customer was already walking.
  const ilceMerkezi = ISTANBUL_DISTRICTS.find(
    (ilce) => ilce.name === dukkanSorgusu.data?.store.district,
  );
  const merkez = coords ?? ilceMerkezi ?? null;
  const alternatifSorgusu = useDiscoveryOffers(
    kapandi && merkez
      ? { lat: merkez.lat, lng: merkez.lng, radiusM: ALTERNATIF_YARICAP_M, pageSize: 5 }
      : null,
  );
  const alternatif: VitrinTeklifi | null =
    alternatifSorgusu.data?.items
      .filter((satir) => satir.offerId !== offerId && satir.qtyLeft > 0)
      .map(teklifeCevir)[0] ?? null;

  const enFazla = Math.min(EN_FAZLA_ADET, teklif?.qtyLeft ?? EN_FAZLA_ADET);

  const onayla = async () => {
    if (!teklif || !dukkanSorgusu.data || !offerId || !onay) return;
    setHata(null);
    try {
      const sonuc = await rezervasyon.mutateAsync({ offerId, qty: adet });
      await savePurchaseSnapshot(sonuc.reservationId, {
        storeName: dukkanSorgusu.data.store.name,
        storeDistrict: dukkanSorgusu.data.store.district,
        bagTitle: teklif.template.title,
        coverImageUrl: dukkanSorgusu.data.store.coverImageUrl,
        pickupStartAt: teklif.pickupStartAt,
        pickupEndAt: teklif.pickupEndAt,
      });
      router.replace({
        pathname: "/payment/[id]",
        params: {
          id: sonuc.reservationId,
          redirectUrl: sonuc.payment.redirectUrl ?? "",
          code: sonuc.code,
        },
      });
    } catch (err) {
      if (isOfferUnavailableError(err)) setKapandi(true);
      else setHata(getErrorMessage(err, t));
    }
  };

  if (kapandi) {
    return (
      <KapandiEkrani
        alternatif={alternatif}
        azaltHareket={azaltHareket}
        onKesfet={() => router.replace("/(tabs)")}
        onAlternatif={(secilen) =>
          router.replace({
            pathname: "/offer/[id]",
            params: {
              id: secilen.teklifId,
              storeId: secilen.dukkanId,
              distanceM: String(secilen.mesafeM),
            },
          })
        }
      />
    );
  }

  if (dukkanSorgusu.isLoading) {
    return <DurumEkrani tur="yukleniyor" baslik={t("common.loading")} />;
  }

  if (!teklif) {
    return (
      <DurumEkrani
        tur="hata"
        baslik={t("offerDetail.loadError")}
        eylemEtiketi={t("dugme.kesfet")}
        onEylem={() => router.replace("/(tabs)")}
      />
    );
  }

  const birim = teklif.template.priceCents;

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
          testID="alim-geri"
        />
        <Text style={[yazi.title, { color: palet.yaziAna }]} numberOfLines={1}>
          {t("purchase.title")}
        </Text>
        <View style={styles.ikonBosluk} />
      </View>

      <ScrollView contentContainerStyle={styles.icerik} showsVerticalScrollIndicator={false}>
        <View style={styles.bolum}>
          <Text
            style={[yazi.tabelaLg, { color: palet.yaziAna }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
          >
            {trUpper(dukkanSorgusu.data?.store.name ?? "")}
          </Text>
          <Text style={[yazi.paket, { color: palet.yaziSis }]} numberOfLines={2}>
            {teklif.template.title}
          </Text>
          <Text style={[yazi.data, { color: palet.yaziSis }]} numberOfLines={1}>
            {formatPickupWindow(teklif.pickupStartAt, teklif.pickupEndAt)}
          </Text>
        </View>

        <View style={styles.bolum}>
          <BolumBasligi etiket={t("purchase.quantityTitle")} palet={palet} />
          <Blok palet={palet}>
            <View style={styles.sayac}>
              <SayacDugmesi
                yol="M6 12 H18"
                etiket={t("purchase.decreaseQty")}
                pasif={adet <= 1}
                onPress={() => setAdet((n) => Math.max(1, n - 1))}
                palet={palet}
              />
              <Text
                testID="purchase-qty"
                style={[yazi.priceXl, styles.sayi, { color: palet.yaziAna }]}
                maxFontSizeMultiplier={1.3}
              >
                {adet}
              </Text>
              <SayacDugmesi
                yol="M12 6 V18 M6 12 H18"
                etiket={t("purchase.increaseQty")}
                pasif={adet >= enFazla}
                onPress={() => setAdet((n) => Math.min(enFazla, n + 1))}
                palet={palet}
              />
            </View>
            <View style={styles.toplamSatiri}>
              <Text style={[yazi.label, { color: palet.yaziSis }]}>
                {t("purchase.total")}
              </Text>
              <Text
                style={[yazi.priceLg, { color: palet.sodyumYazi }]}
                maxFontSizeMultiplier={1.3}
              >
                {fiyatMetni(birim * adet)}
              </Text>
            </View>
          </Blok>
        </View>

        <View style={styles.bolum}>
          <BolumBasligi etiket={t("purchase.preContractTitle")} palet={palet} />
          <Blok palet={palet}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/legal/[doc]",
                  params: { doc: "on-bilgilendirme-formu" },
                })
              }
              accessibilityRole="link"
              style={({ pressed }) => (pressed ? { opacity: m.pressOpacity } : null)}
            >
              <Text style={[yazi.bodyStrong, styles.baglanti, { color: palet.sodyumYazi }]}>
                {t("purchase.preContractObf")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/legal/[doc]",
                  params: { doc: "mesafeli-satis-sozlesmesi" },
                })
              }
              accessibilityRole="link"
              style={({ pressed }) => (pressed ? { opacity: m.pressOpacity } : null)}
            >
              <Text style={[yazi.bodyStrong, styles.baglanti, { color: palet.sodyumYazi }]}>
                {t("purchase.preContractMss")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.onaySatiri}
              onPress={() => setOnay((secili) => !secili)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: onay }}
              accessibilityLabel={t("purchase.consentLabel")}
              testID="purchase-consent-checkbox"
            >
              <View
                style={[
                  styles.kutucuk,
                  {
                    borderColor: onay ? palet.sodyumDolgu : palet.yaziSis,
                    // Empty means EMPTY: an unchecked box is the surface it
                    // sits on with a line around it, not a filled tile that
                    // reads as already answered.
                    backgroundColor: onay ? palet.sodyumDolgu : palet.yuzeyKaldirim,
                  },
                ]}
              >
                {onay ? (
                  <Svg width={16} height={16}>
                    <Path
                      d="M3 8.5 L6.5 12 L13 4.5"
                      stroke={palet.sodyumMurekkep}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                ) : null}
              </View>
              <Text style={[yazi.body, styles.onayYazisi, { color: palet.yaziSis }]}>
                {t("purchase.consentLabel")}
              </Text>
            </Pressable>
          </Blok>
        </View>

        {hata ? (
          <Text
            style={[
              yazi.bodyStrong,
              styles.hata,
              { backgroundColor: palet.tenteDolgu, color: palet.tenteMurekkep },
            ]}
          >
            {hata}
          </Text>
        ) : null}
      </ScrollView>

      <YapiskanCubuk palet={palet}>
        <Dugme
          etiket={
            rezervasyon.isPending
              ? t("dugme.olusturuluyor")
              : t("dugme.odemeyeGec", { fiyat: fiyatMetni(birim * adet) })
          }
          pasif={!onay || rezervasyon.isPending}
          onPress={() => {
            void onayla();
          }}
          palet={palet}
          testID="purchase-confirm"
        />
      </YapiskanCubuk>
    </SafeAreaView>
  );
}

function SayacDugmesi({
  yol,
  etiket,
  pasif,
  onPress,
  palet,
}: {
  yol: string;
  etiket: string;
  pasif: boolean;
  onPress: () => void;
  palet: Palet;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      accessibilityState={{ disabled: pasif }}
      disabled={pasif}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sayacDugmesi,
        { borderColor: palet.yaziSis },
        pasif ? styles.pasif : null,
        pressed ? { opacity: m.pressOpacity } : null,
      ]}
    >
      <Svg width={24} height={24}>
        <Path
          d={yol}
          stroke={palet.yaziAna}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Pressable>
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
  icerik: { paddingHorizontal: s.s4, paddingBottom: s.s8, gap: s.s6 },
  bolum: { gap: s.s2 },
  sayac: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: s.s8,
  },
  sayacDugmesi: {
    width: 48,
    height: 48,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pasif: { opacity: 0.35 },
  sayi: { minWidth: 56, textAlign: "center" },
  toplamSatiri: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: s.s3,
  },
  baglanti: { paddingVertical: s.s1 },
  onaySatiri: { flexDirection: "row", gap: s.s3, marginTop: s.s2 },
  kutucuk: {
    width: 24,
    height: 24,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  onayYazisi: { flex: 1 },
  hata: {
    padding: s.s3,
    borderRadius: r.card,
    overflow: "hidden",
  },
});
