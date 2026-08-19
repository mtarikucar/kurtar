import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { usePalet } from "../design/theme";
import { m, r, s, yazi } from "../design/tokens";

/**
 * `birincil` — the sodium fill with `#12181F` ink (spec §3: "CTA ink is
 * bg.asfalt on it"). `ikincil` — a hairline outline on the ground, for a
 * second action that must be reachable without competing with the first.
 * `hayalet` — type only, in the ground's secondary ink, so it reads as
 * the quieter of two ways out. `tehlike` — the awning-red fill with dark
 * ink, because red is a FILL in this app, never type on a surface (§1.1).
 */
type Varyant = "birincil" | "ikincil" | "hayalet" | "tehlike";

interface ButtonProps {
  label: string;
  onPress: () => void;
  varyant?: Varyant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The CTA primitive for every screen outside the money path (which has
 * `teslim/ortak`'s 56pt `Dugme`) and outside the Track C panels (which
 * have `PanelButton`). Same doctrine as both: 48pt minimum, `r.cta`
 * radius — never the pill or the rounded tile — elevation 0, and the
 * entire press budget is one opacity, no scale and no glow (§1.3/§5.10).
 *
 * `ikincil` outlines in `yaziSisZemin` rather than `cizgiKil`: this
 * button is usually the only affordance on an otherwise empty ground,
 * and a hairline sits at ~1.4:1 against the asphalt in every phase —
 * fine as a chip's edge in a row of chips, invisible as a lone control.
 */
export function Button({
  label,
  onPress,
  varyant = "birincil",
  disabled,
  loading,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const palet = usePalet();
  const kapali = disabled || loading;

  const dolgu: ViewStyle =
    varyant === "birincil"
      ? { backgroundColor: palet.sodyumDolgu }
      : varyant === "tehlike"
        ? { backgroundColor: palet.tenteDolgu }
        : varyant === "ikincil"
          ? { borderWidth: 1, borderColor: palet.yaziSisZemin }
          : {};

  const yaziRengi =
    varyant === "birincil"
      ? palet.sodyumMurekkep
      : varyant === "tehlike"
        ? palet.tenteMurekkep
        : varyant === "ikincil"
          ? palet.yaziAnaZemin
          : palet.yaziSisZemin;

  return (
    <Pressable
      onPress={onPress}
      disabled={kapali}
      accessibilityRole="button"
      accessibilityState={{ disabled: kapali, busy: loading }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.taban,
        dolgu,
        kapali ? styles.kapali : null,
        pressed && !kapali ? { opacity: m.pressOpacity } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={yaziRengi} />
      ) : (
        <Text
          style={[yazi.body, styles.etiket, { color: yaziRengi }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
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
    flexDirection: "row",
    elevation: 0,
  },
  etiket: { fontFamily: "Archivo_600SemiBold" },
  kapali: { opacity: 0.45 },
});
