import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi } from "../../design/tokens";

type Varyant = "birincil" | "hayalet" | "tehlike";

/**
 * The CTA primitive for Track C's screens — sodium fill / dark ink for the
 * primary action (spec §3's `CTA ink is bg.asfalt on it`), a ghost variant
 * for secondary actions, radius `r.cta` (never the rejected pill/rounded-
 * tile radius). `activeOpacity` is the ENTIRE press budget (spec §1.3/§5.10
 * — no scale, no glow).
 */
export function PanelButton({
  label,
  onPress,
  varyant = "birincil",
  disabled,
  loading,
  testID,
}: {
  label: string;
  onPress: () => void;
  varyant?: Varyant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const palet = usePalet();
  const kapali = disabled || loading;

  const dolgu =
    varyant === "birincil"
      ? { backgroundColor: palet.sodyumDolgu }
      : varyant === "tehlike"
        ? { backgroundColor: palet.tenteDolgu }
        : { backgroundColor: "transparent", borderWidth: 1, borderColor: palet.cizgiKil };
  const yazRengi =
    varyant === "birincil"
      ? palet.sodyumMurekkep
      : varyant === "tehlike"
        ? palet.tenteMurekkep
        : palet.yaziAna;

  return (
    <Pressable
      onPress={onPress}
      disabled={kapali}
      accessibilityRole="button"
      accessibilityState={{ disabled: kapali, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.taban,
        dolgu,
        kapali && styles.kapali,
        pressed && !kapali ? { opacity: m.pressOpacity } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={yazRengi} />
      ) : (
        <Text style={[yazi.body, styles.etiket, { color: yazRengi }]} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  taban: {
    minHeight: 48,
    borderRadius: r.cta,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s6,
  },
  etiket: {
    fontFamily: "Archivo_600SemiBold",
  },
  kapali: { opacity: 0.45 },
});
