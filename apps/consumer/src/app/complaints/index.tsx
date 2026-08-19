import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { s } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelHeader } from "../../components/panel/PanelHeader";
import { PanelEmptyState } from "../../components/panel/PanelEmptyState";
import { PanelErrorState } from "../../components/panel/PanelErrorState";
import { PanelLoadingState } from "../../components/panel/PanelLoadingState";
import { ComplaintRow } from "../../components/ComplaintRow";
import { useMyComplaints } from "../../hooks/use-complaints";

export default function MyComplaintsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const complaintsQuery = useMyComplaints();

  const items = complaintsQuery.data?.items ?? [];

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t("complaints.title")}
        onBack={() => router.back()}
        backLabel={t("common.back")}
      />

      {complaintsQuery.isLoading ? (
        <PanelLoadingState />
      ) : complaintsQuery.isError && items.length === 0 ? (
        <PanelErrorState onRetry={() => complaintsQuery.refetch()} />
      ) : items.length === 0 ? (
        <PanelEmptyState
          icon="chatbubble-ellipses-outline"
          title={t("complaints.emptyTitle")}
          body={t("complaints.emptyBody")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.icerik}
          refreshControl={
            <RefreshControl
              refreshing={complaintsQuery.isRefetching}
              onRefresh={() => complaintsQuery.refetch()}
              tintColor={palet.sodyumDolgu}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.satirAraligi}>
              <ComplaintRow
                complaint={item}
                onPress={() =>
                  router.push({ pathname: "/complaints/[id]", params: { id: item.id } })
                }
              />
            </View>
          )}
        />
      )}
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
  },
  satirAraligi: { marginBottom: s.s3 },
});
