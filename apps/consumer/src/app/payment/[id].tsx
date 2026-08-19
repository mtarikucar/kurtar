import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";
import {
  DurumEkrani,
  IKON,
  IkonDugmesi,
} from "../../components/teslim";
import { OnayEkrani } from "../../components/teslim/OnayEkrani";
import { useReduceMotion } from "../../design/reduce-motion";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import {
  RESERVATIONS_QUERY_KEY,
  fetchMyReservations,
} from "../../hooks/use-reservations";
import { useOrderDetails } from "../../hooks/use-order-details";
import { formatPickupWindow } from "../../lib/format";

const YOKLAMA_MS = 3000;
const BITEN_DURUMLAR = new Set([
  "CANCELLED_BY_USER",
  "CANCELLED_BY_MERCHANT",
  "EXPIRED",
]);

/**
 * The provider redirect happens in a WebView and this app never sees card
 * data: it opens `redirectUrl` and then learns the RESULT the same way it
 * learns anything else — by polling the one consumer-reachable read
 * (`GET /reservations/mine`) — never by parsing the WebView's navigation
 * state, which the mock provider's fake domain does not even serve.
 *
 * The confirmed branch is spec §4.4: full-screen, the shutter rolls UP,
 * and the ticket settles under a lit sign. It is deliberately NOT a toast
 * and deliberately not a checkmark.
 */
export default function OdemeEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const azaltHareket = useReduceMotion();
  const { id, redirectUrl } = useLocalSearchParams<{
    id: string;
    redirectUrl: string;
    code: string;
  }>();

  const [webHatasi, setWebHatasi] = useState(false);

  const yoklama = useQuery({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: fetchMyReservations,
    refetchInterval: (query) => {
      const kayitlar = query.state.data?.items ?? [];
      const benim = kayitlar.find((kayit) => kayit.id === id);
      if (!benim) return YOKLAMA_MS;
      if (benim.status === "CONFIRMED" || BITEN_DURUMLAR.has(benim.status)) {
        return false;
      }
      return YOKLAMA_MS;
    },
  });

  const benim = yoklama.data?.items.find((kayit) => kayit.id === id);
  const onaylandi = benim?.status === "CONFIRMED";
  const basarisiz = benim ? BITEN_DURUMLAR.has(benim.status) : false;

  // Only for the shop/bag NAMES — every number below comes off the
  // reservation the server just confirmed.
  const detay = useOrderDetails(id ?? "");

  const kapat = () => {
    Alert.alert(t("payment.closeConfirmTitle"), t("payment.closeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        style: "destructive",
        onPress: () => router.replace("/(tabs)/orders"),
      },
    ]);
  };

  if (onaylandi && benim) {
    return (
      <OnayEkrani
        dukkanAdi={detay.data?.storeName ?? t("orders.unknownStoreName")}
        paketAdi={detay.data?.bagTitle ?? null}
        adet={benim.qty}
        toplamKurus={benim.totalCents}
        kod={benim.code}
        pencere={formatPickupWindow(benim.pickupStartAt, benim.pickupEndAt)}
        azaltHareket={azaltHareket}
        onKepengiAc={() =>
          router.replace({ pathname: "/redeem/[id]", params: { id } })
        }
        onSiparisler={() =>
          router.replace({ pathname: "/order/[id]", params: { id } })
        }
      />
    );
  }

  if (basarisiz) {
    return (
      <DurumEkrani
        tur="kapali"
        baslik={t("payment.failedTitle")}
        govde={t("payment.failedBody")}
        eylemEtiketi={t("dugme.kesfet")}
        onEylem={() => router.replace("/(tabs)")}
        testID="odeme-basarisiz"
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.kok, { backgroundColor: palet.bgAsfalt }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.ustCubuk}>
        <IkonDugmesi
          yol={IKON.geri}
          etiket={t("common.close")}
          onPress={kapat}
          palet={palet}
          testID="odeme-kapat"
        />
        <Text style={[yazi.title, { color: palet.yaziAna }]} numberOfLines={1}>
          {t("payment.title")}
        </Text>
        <View style={styles.ikonBosluk} />
      </View>

      <Text
        style={[yazi.body, styles.bekleme, { color: palet.yaziSis }]}
        maxFontSizeMultiplier={1.5}
      >
        {t("payment.waiting")}
      </Text>

      {webHatasi || !redirectUrl ? (
        <View style={styles.orta}>
          <Text style={[yazi.body, styles.bekleme, { color: palet.yaziAna }]}>
            {t("payment.loadError")}
          </Text>
          <Text style={[yazi.data, styles.bekleme, { color: palet.yaziSis }]}>
            {t("payment.checking")}
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: redirectUrl }}
          style={styles.web}
          onError={() => setWebHatasi(true)}
          onHttpError={() => setWebHatasi(true)}
          startInLoadingState
        />
      )}
    </SafeAreaView>
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
  bekleme: { textAlign: "center", paddingHorizontal: s.s5 },
  orta: { flex: 1, alignItems: "center", justifyContent: "center", gap: s.s3 },
  web: { flex: 1 },
});
