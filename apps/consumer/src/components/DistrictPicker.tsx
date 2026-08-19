import { useContext } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useReduceMotion } from "../design/reduce-motion";
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
 *
 * It also does not FLY. This is the recovery path for a user who denied
 * location — including, specifically, a user who turned reduce motion on —
 * so a 70%-of-the-screen sheet sliding up is exactly the movement §2's
 * Degradation clause exists to suppress. Suppressing it costs nothing:
 * the sheet's content, scrim, radius and contact edge are identical
 * either way, so the end state still carries everything the motion did.
 *
 * The sheet SURFACE keeps touching the physical bottom edge — it is a
 * sheet — but the list inside it stops above the system navigation bar,
 * because a district resting at the bottom of the scroll used to be
 * covered by that bar and tapping it pressed Home.
 */
export function DistrictPicker({ visible, onSelect, onClose }: DistrictPickerProps) {
  const { t } = useTranslation();
  const palet = usePalet();
  const azaltHareket = useReduceMotion();
  // The context directly, not `useSafeAreaInsets()`: that hook THROWS
  // when no provider is above it, and this sheet is mounted (invisible)
  // by two tabs, so one missing provider would take those screens down
  // with it. Expo Router's own root supplies the provider in the app; a
  // missing one here just means no extra bottom room, never a crash.
  const altBosluk = useContext(SafeAreaInsetsContext)?.bottom ?? 0;

  return (
    <Modal
      visible={visible}
      // `null` is "not yet known", and an unknown answer is treated as
      // "no movement" — the same `=== false` convention theme.tsx uses.
      animationType={azaltHareket === false ? "slide" : "none"}
      transparent
      onRequestClose={onClose}
    >
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
            contentContainerStyle={{ paddingBottom: altBosluk }}
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
