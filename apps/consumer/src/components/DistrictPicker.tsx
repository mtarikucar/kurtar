import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { m, r, s, yazi } from "../design/tokens";
import { ISTANBUL_DISTRICTS, type LatLng } from "../lib/location";
import { IconButton } from "./IconButton";

interface DistrictPickerProps {
  visible: boolean;
  onSelect: (coords: LatLng, name: string) => void;
  onClose: () => void;
}

/**
 * The "never a dead end" fallback for a denied or unavailable location
 * permission (§4.8 LOCATION DENIED) — pick an approximate area to search
 * around instead. See lib/location.ts on why this is Istanbul-only and
 * approximate by construction.
 *
 * A bottom sheet is one of the three surfaces §1.3 lets float over
 * content, so it takes `yuzeyYukselti`, the `r.sheet` radius and a hard
 * contact edge at its top rather than a shadow of its own invention. The
 * scrim is the deep ground at 78%, never `'transparent'`-adjacent (§5.7).
 */
export function DistrictPicker({ visible, onSelect, onClose }: DistrictPickerProps) {
  const { t } = useTranslation();
  const palet = usePalet();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.perde, { backgroundColor: "rgba(14,20,26,0.78)" }]}>
        <View
          style={[
            styles.tabaka,
            { backgroundColor: palet.yuzeyYukselti, borderTopColor: palet.bgDerin },
          ]}
        >
          <View style={[styles.baslikSatiri, { borderBottomColor: palet.cizgiKil }]}>
            <Text style={[yazi.title, { color: palet.yaziAna }]}>
              {t("discover.chooseDistrict")}
            </Text>
            <IconButton
              name="close"
              accessibilityLabel={t("common.close")}
              color={palet.yaziAna}
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
                style={({ pressed }) => [
                  styles.satir,
                  { borderBottomColor: palet.cizgiKil },
                  pressed ? { opacity: m.pressOpacity } : null,
                ]}
              >
                <Text style={[yazi.body, { color: palet.yaziAna }]}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  perde: { flex: 1, justifyContent: "flex-end" },
  tabaka: {
    borderTopLeftRadius: r.sheet,
    borderTopRightRadius: r.sheet,
    borderTopWidth: 1,
    maxHeight: "70%",
    elevation: 0,
  },
  baslikSatiri: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: s.s4,
    paddingRight: s.s2,
    paddingVertical: s.s2,
    borderBottomWidth: 1,
  },
  satir: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: s.s4,
    borderBottomWidth: 1,
  },
});
