import { Pressable, StyleSheet, View } from "react-native";
import { usePalet } from "../../design/theme";

const GENISLIK = 46;
const YUKSEKLIK = 28;
const TOP_CAPI = 22;
const KENAR_BOSLUK = 3;

/**
 * A hand-painted on/off track — not RN's native `<Switch>`. On web,
 * react-native-web's Switch renders through the browser's own checkbox
 * chrome and does not reliably honour `thumbColor` for the checked
 * thumb: it shows the platform's default accent (a green/teal on
 * Chromium), which is exactly the colour spec §1.1/§5.9 bans outright
 * ("there is no green anywhere in this app"). Painting the track and
 * thumb ourselves in the phase's own tokens removes the platform default
 * entirely, on every target this app ships to.
 */
export function PanelToggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
}) {
  const palet = usePalet();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[
        styles.iz,
        {
          backgroundColor: value ? palet.sodyumDolgu : palet.cizgiKil,
        },
      ]}
    >
      <View
        style={[
          styles.top,
          {
            backgroundColor: value ? palet.sodyumMurekkep : palet.yaziAna,
            transform: [{ translateX: value ? GENISLIK - TOP_CAPI - KENAR_BOSLUK * 2 : 0 }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iz: {
    width: GENISLIK,
    height: YUKSEKLIK,
    borderRadius: YUKSEKLIK / 2,
    padding: KENAR_BOSLUK,
    justifyContent: "center",
  },
  top: {
    width: TOP_CAPI,
    height: TOP_CAPI,
    borderRadius: TOP_CAPI / 2,
  },
});
