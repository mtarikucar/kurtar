import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { useSimdi } from "../../design/saat";
import { useReduceMotion } from "../../design/reduce-motion";
import { r, s, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelHeader } from "../../components/panel/PanelHeader";
import { PanelButton } from "../../components/panel/PanelButton";
import { PanelPill } from "../../components/panel/PanelPill";
import { PanelLoadingState } from "../../components/panel/PanelLoadingState";
import { PanelEmptyState } from "../../components/panel/PanelEmptyState";
import { Tente } from "../../components/kepenk/Tente";
import { Tabela } from "../../components/kepenk/Tabela";
import { ZamanHapi } from "../../components/kepenk/ZamanHapi";
import { tenteDeseni } from "../../components/kepenk/tente-desen";
import { fiyatMetni } from "../../components/kepenk/olcum";
import { siparisKalanDakika, siparisPillDurumu } from "../../lib/order-durum";
import { saatBulunma } from "../../components/kepenk/tr-saat";
import { useOrderDetails, type OrderDetails } from "../../hooks/use-order-details";
import { formatClockTime, formatClockWithSeconds, formatPickupWindow } from "../../lib/format";

const TENTE_YUKSEKLIK = 6;
const TABELA_YUKSEKLIK = 40;

/**
 * The order TICKET — spec §4.6: "Tapping a past row shows the ticket: kod
 * 4729 · 69₺ · 18:34:11 in data.lg." Reuses the card's own tente hash and
 * tabela plaque, so the shop is the same object here as it is everywhere
 * else in the app — the spec's own instruction for this track ("reuses
 * the tente hash and the ticket layout") rather than a second identity
 * device.
 */
export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const simdi = useSimdi();
  const azaltHareket = useReduceMotion();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useOrderDetails(id ?? "");

  const genislik = Math.min(width - s.s4 * 2, 480);

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t("orders.title")}
        onBack={() => router.back()}
        backLabel={t("common.back")}
      />

      {isLoading ? (
        <PanelLoadingState />
      ) : !data ? (
        <PanelEmptyState icon="alert-circle-outline" title={t("errors.RESERVATION_NOT_FOUND")} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.tabelaAlani}>
            <Tente
              genislik={genislik}
              yukseklik={TENTE_YUKSEKLIK}
              desen={tenteDeseni(data.reservation.storeId)}
            />
            <Tabela
              genislik={genislik}
              yukseklik={TABELA_YUKSEKLIK}
              ad={data.storeName}
              palet={palet}
            />
          </View>
          {data.storeDistrict ? (
            <Text style={[yazi.data, styles.ilce, { color: palet.yaziSisZemin }]}>
              {data.storeDistrict}
            </Text>
          ) : null}

          <View
            style={[
              styles.bilet,
              {
                backgroundColor: palet.yuzeyKaldirim,
                borderTopColor: palet.kartUstIsik,
                borderBottomColor: palet.kartAltTemas,
              },
            ]}
          >
            {data.bagTitle ? (
              <Text style={[yazi.paket, { color: palet.yaziAna }]}>{data.bagTitle}</Text>
            ) : null}

            <View style={styles.satir}>
              <Text style={[yazi.data, { color: palet.yaziSis }]}>
                {t("redeem.qtyLabel")}: {data.reservation.qty}
              </Text>
              <Text style={[yazi.priceLg, { color: palet.sodyumYazi }]}>
                {fiyatMetni(data.reservation.totalCents)}
              </Text>
            </View>

            <SiparisDurumBolumu
              reservation={data.reservation}
              pickupStartAt={data.pickupStartAt}
              pickupEndAt={data.pickupEndAt}
              simdi={simdi}
              azaltHareket={azaltHareket}
            />
          </View>
        </ScrollView>
      )}
    </PanelScreen>
  );
}

function SiparisDurumBolumu({
  reservation,
  pickupStartAt,
  pickupEndAt,
  simdi,
  azaltHareket,
}: {
  reservation: OrderDetails["reservation"];
  pickupStartAt: string;
  pickupEndAt: string;
  simdi: Date;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();

  const iptalEdilebilir = simdi.getTime() < new Date(reservation.cancelDeadlineAt).getTime();

  if (reservation.status === "PENDING_PAYMENT") {
    return (
      <View style={styles.durumBlok}>
        <PanelPill label={t("orders.status.PENDING_PAYMENT")} />
        {iptalEdilebilir ? (
          <PanelButton
            varyant="hayalet"
            label={t("orders.cancelCta")}
            onPress={() => router.push({ pathname: "/cancel/[id]", params: { id: reservation.id } })}
          />
        ) : null}
      </View>
    );
  }

  if (reservation.status === "CONFIRMED") {
    const durum = siparisPillDurumu(simdi, pickupStartAt);
    const kalanDk = siparisKalanDakika(simdi, pickupEndAt);
    const acilisSaati = saatBulunma(formatClockTime(pickupStartAt));
    return (
      <View style={styles.durumBlok}>
        <Text style={[yazi.data, { color: palet.yaziSis }]}>
          {t("orders.aliniyor", { pencere: formatPickupWindow(pickupStartAt, pickupEndAt) })}
        </Text>
        <ZamanHapi
          durum={durum}
          kalanDk={kalanDk}
          acilisSaati={acilisSaati}
          palet={palet}
          azaltHareket={azaltHareket}
        />
        <PanelButton
          label={t("orders.kepenkAc")}
          onPress={() => router.push({ pathname: "/redeem/[id]", params: { id: reservation.id } })}
        />
        {iptalEdilebilir ? (
          <PanelButton
            varyant="hayalet"
            label={t("orders.cancelCta")}
            onPress={() => router.push({ pathname: "/cancel/[id]", params: { id: reservation.id } })}
          />
        ) : null}
      </View>
    );
  }

  if (reservation.status === "REDEEMED") {
    const saat = reservation.redeemedAt
      ? formatClockWithSeconds(new Date(reservation.redeemedAt))
      : "—";
    return (
      <View style={styles.durumBlok}>
        <Text style={[yazi.dataLg, { color: palet.sodyumYazi }]}>
          {t("orders.ticketOzet", {
            kod: reservation.code,
            fiyat: fiyatMetni(reservation.totalCents),
            saat,
          })}
        </Text>
        <PanelButton
          varyant="hayalet"
          label={t("orders.rateCta")}
          onPress={() => router.push({ pathname: "/rate/[id]", params: { id: reservation.id } })}
        />
      </View>
    );
  }

  return (
    <View style={styles.durumBlok}>
      <PanelPill label={t(`orders.status.${reservation.status}`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
    gap: s.s3,
    alignItems: "center",
  },
  tabelaAlani: {
    width: "100%",
    borderRadius: r.card,
    overflow: "hidden",
  },
  ilce: { alignSelf: "flex-start" },
  bilet: {
    width: "100%",
    borderRadius: r.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    padding: s.s4,
    gap: s.s3,
  },
  satir: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  durumBlok: {
    gap: s.s3,
    marginTop: s.s2,
  },
});
