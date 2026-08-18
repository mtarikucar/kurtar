import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ComplaintRow } from "../../components/ComplaintRow";
import { useMyComplaints } from "../../hooks/use-complaints";

/**
 * [I8 fix] The read side of the complaint flow — before this screen
 * existed, a consumer could file a complaint (complaint/new.tsx) but had
 * no way to ever see the merchant's or admin's reply.
 */
export default function MyComplaintsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const complaintsQuery = useMyComplaints();

  const items = complaintsQuery.data?.items ?? [];

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("complaints.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {complaintsQuery.isLoading ? (
        <LoadingState />
      ) : complaintsQuery.isError && items.length === 0 ? (
        <ErrorState onRetry={() => complaintsQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title={t("complaints.emptyTitle")}
          body={t("complaints.emptyBody")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={complaintsQuery.isRefetching}
              onRefresh={() => complaintsQuery.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          renderItem={({ item }) => (
            <ComplaintRow
              complaint={item}
              onPress={() =>
                router.push({ pathname: "/complaints/[id]", params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  listContent: {
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
  },
});
