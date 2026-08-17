import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";
import type { MapPaneProps } from "./MapPane.types";

/**
 * Web build of the map pane. `react-native-maps` has no supported web
 * renderer (the brief specifies Apple Maps on iOS / Google on Android
 * only — web is deliberately out of scope for the map view), so the
 * `.native.tsx` sibling (which imports react-native-maps + supercluster)
 * is never even bundled for web — Metro/webpack picks this file instead
 * by the `.web.tsx` extension convention, so there is no risk of the
 * native map module crashing a web session. List view remains fully
 * functional on web either way.
 */
export function MapPane({ onSwitchToList }: MapPaneProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <EmptyState
        icon="map-outline"
        title={t("discover.viewMap")}
        body={t("discover.mapUnavailableWeb")}
        ctaLabel={t("discover.viewList")}
        onPressCta={onSwitchToList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
