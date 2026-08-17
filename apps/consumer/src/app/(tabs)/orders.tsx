import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { OrderRow } from "../../components/OrderRow";
import { Chip } from "../../components/Chip";
import { useReservations } from "../../hooks/use-reservations";
import type { ReservationItem } from "../../lib/api-types";

const ACTIVE_STATUSES: ReservationItem["status"][] = ["PENDING_PAYMENT", "CONFIRMED"];

export default function OrdersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "past">("active");
  const reservationsQuery = useReservations();

  const data = reservationsQuery.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const active = useMemo(
    () => items.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [items],
  );
  const past = useMemo(
    () => items.filter((r) => !ACTIVE_STATUSES.includes(r.status)),
    [items],
  );

  const visible = tab === "active" ? active : past;

  return (
    <Screen>
      <Text style={styles.title}>{t("orders.title")}</Text>

      <View style={styles.tabRow}>
        <Chip
          label={`${t("orders.active")} (${active.length})`}
          selected={tab === "active"}
          onPress={() => setTab("active")}
        />
        <Chip
          label={t("orders.past")}
          selected={tab === "past"}
          onPress={() => setTab("past")}
        />
      </View>

      {reservationsQuery.isLoading ? (
        <LoadingState />
      ) : reservationsQuery.isError && items.length === 0 ? (
        <ErrorState onRetry={() => reservationsQuery.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={tab === "active" ? t("orders.emptyActiveTitle") : t("orders.emptyPastTitle")}
          body={tab === "active" ? t("orders.emptyActiveBody") : t("orders.emptyPastBody")}
          ctaLabel={tab === "active" ? t("orders.browseCta") : undefined}
          onPressCta={tab === "active" ? () => router.push("/(tabs)") : undefined}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={reservationsQuery.isRefetching}
              onRefresh={() => reservationsQuery.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          renderItem={({ item }) => (
            <OrderRow
              reservation={item}
              onPress={() =>
                router.push({ pathname: "/order/[id]", params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing["3xl"],
  },
});
