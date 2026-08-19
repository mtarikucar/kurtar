import { useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelEmptyState } from "../../components/panel/PanelEmptyState";
import { PanelErrorState } from "../../components/panel/PanelErrorState";
import { PanelLoadingState } from "../../components/panel/PanelLoadingState";
import { OrderRow } from "../../components/OrderRow";
import { useReservations } from "../../hooks/use-reservations";
import type { ReservationItem } from "../../lib/api-types";

const ACTIVE_STATUSES: ReservationItem["status"][] = ["PENDING_PAYMENT", "CONFIRMED"];

type Satir =
  | { tur: "baslik"; anahtar: string; metin: string }
  | { tur: "siparis"; anahtar: string; reservation: ReservationItem };

/**
 * SİPARİŞLER — spec §4.6. Two sections in ONE scrollable list, pre-
 * uppercased: AKTİF then GEÇMİŞ — not the old Chip-toggle between two
 * separately-fetched views. `GET /reservations/mine` already returns the
 * caller's whole history in one page (see use-reservations.ts's own doc
 * comment on why), so this is a client-side partition of data already in
 * hand, not two queries.
 */
export default function OrdersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const reservationsQuery = useReservations();

  const items = useMemo(() => reservationsQuery.data?.items ?? [], [reservationsQuery.data]);
  const active = useMemo(
    () => items.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [items],
  );
  const past = useMemo(
    () => items.filter((r) => !ACTIVE_STATUSES.includes(r.status)),
    [items],
  );

  const satirlar = useMemo<Satir[]>(() => {
    const sonuc: Satir[] = [];
    if (active.length > 0) {
      sonuc.push({ tur: "baslik", anahtar: "baslik-aktif", metin: t("orders.activeSection") });
      for (const r of active) sonuc.push({ tur: "siparis", anahtar: r.id, reservation: r });
    }
    if (past.length > 0) {
      sonuc.push({ tur: "baslik", anahtar: "baslik-gecmis", metin: t("orders.pastSection") });
      for (const r of past) sonuc.push({ tur: "siparis", anahtar: r.id, reservation: r });
    }
    return sonuc;
  }, [active, past, t]);

  return (
    <PanelScreen padded={false}>
      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
        {t("orders.title")}
      </Text>

      {reservationsQuery.isLoading ? (
        <PanelLoadingState />
      ) : reservationsQuery.isError && items.length === 0 ? (
        <PanelErrorState onRetry={() => reservationsQuery.refetch()} />
      ) : items.length === 0 ? (
        <PanelEmptyState
          icon="receipt-outline"
          title={t("orders.emptyPastTitle")}
          body={t("orders.emptyPastBody")}
          ctaLabel={t("orders.browseCta")}
          onPressCta={() => router.push("/(tabs)")}
        />
      ) : (
        <FlatList
          data={satirlar}
          keyExtractor={(item) => item.anahtar}
          contentContainerStyle={styles.listeIcerik}
          refreshControl={
            <RefreshControl
              refreshing={reservationsQuery.isRefetching}
              onRefresh={() => reservationsQuery.refetch()}
              tintColor={palet.sodyumDolgu}
            />
          }
          renderItem={({ item }) =>
            item.tur === "baslik" ? (
              <Text style={[yazi.label, styles.bolumBasligi, { color: palet.yaziSisZemin }]}>
                {item.metin}
              </Text>
            ) : (
              <View style={styles.satirAraligi}>
                <OrderRow
                  reservation={item.reservation}
                  onPress={() =>
                    router.push({ pathname: "/order/[id]", params: { id: item.reservation.id } })
                  }
                  onKepenkAc={() =>
                    router.push({ pathname: "/redeem/[id]", params: { id: item.reservation.id } })
                  }
                />
              </View>
            )
          }
        />
      )}
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  baslik: {
    paddingHorizontal: s.s4,
    paddingTop: s.s2,
    paddingBottom: s.s3,
  },
  listeIcerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
  },
  bolumBasligi: {
    marginTop: s.s4,
    marginBottom: s.s2,
  },
  satirAraligi: {
    marginBottom: s.s3,
  },
});
