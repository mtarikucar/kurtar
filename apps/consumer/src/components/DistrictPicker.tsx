import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { ISTANBUL_DISTRICTS, type LatLng } from "../lib/location";
import { IconButton } from "./IconButton";

interface DistrictPickerProps {
  visible: boolean;
  onSelect: (coords: LatLng, name: string) => void;
  onClose: () => void;
}

/** The "never a dead end" fallback for a denied/unavailable location
 * permission (task brief) — lets the user pick an approximate area to
 * search around instead. See lib/location.ts's doc comment for why this
 * is Istanbul-only and approximate by construction. */
export function DistrictPicker({ visible, onSelect, onClose }: DistrictPickerProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("discover.chooseDistrict")}</Text>
            <IconButton
              name="close"
              accessibilityLabel={t("common.close")}
              onPress={onClose}
            />
          </View>
          <FlatList
            data={ISTANBUL_DISTRICTS}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect({ lat: item.lat, lng: item.lng }, item.name)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowLabel}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  title: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[900],
  },
  row: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[50],
  },
  rowPressed: {
    backgroundColor: colors.neutral[50],
  },
  rowLabel: {
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
  },
});
