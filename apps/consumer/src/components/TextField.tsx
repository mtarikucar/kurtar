import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { usePalet } from "../design/theme";
import { r, s, yazi } from "../design/tokens";

interface TextFieldProps extends TextInputProps {
  /** Always required — it is the field's accessibility name even when it
   * is not drawn. */
  label: string;
  error?: string;
  /**
   * Draw the placeholder alone. For a field whose placeholder already
   * says everything the label would (the search slot), where rendering
   * both prints one string twice.
   */
  etiketGizli?: boolean;
}

/**
 * A text field is not a white sheet of paper. On this street it is a
 * SLOT in a shopfront: the card surface `surface.kaldirim` — which is
 * what §1.1 assigns to input fields — cut into the asphalt, wearing the
 * same painted chassis every object in this app wears instead of a
 * shadow: a 1pt top hairline where light lands on the upper edge, a 1pt
 * contact edge underneath, `r.card`, elevation 0 (§1.3 / §5.1). By day
 * that surface is the sign ivory and the slot reads as a painted panel;
 * at night it is the lit card face. In neither phase is it white.
 *
 * Focus is a DISCRETE state change, not a glow: the border swaps to
 * `sodyumYazi` — the phase's legible sodium, since #FFB23F on the day's
 * ivory is 1.45:1 and would vanish exactly when a user needs to see
 * which field has the caret.
 *
 * An error is the app's alarm object, not red type: awning red is a fill
 * with `#12181F` ink on it (§1.1's non-negotiable rule), so the message
 * lands on a red strip under the field and the border turns red with it —
 * the redundancy law, one fact in two places.
 *
 * And it is SPOKEN. A wrong OTP code that only changes pixels is silence
 * to a screen-reader user, who retries the same code until the backend's
 * 24h lockout closes the front door — so the strip is a live region with
 * the `alert` role (Android + RN Web read it as `aria-live`), and on iOS,
 * which has no live-region concept at all, the message is announced
 * directly. Platform-guarded, so Android never says it twice.
 */
export function TextField({
  label,
  error,
  etiketGizli = false,
  style,
  onFocus,
  onBlur,
  ...girisOzellikleri
}: TextFieldProps) {
  const palet = usePalet();
  const [odakli, setOdakli] = useState(false);

  useEffect(() => {
    if (error && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(`${label}: ${error}`);
    }
  }, [error, label]);

  const kenar = error
    ? palet.tenteYazi
    : odakli
      ? palet.sodyumYazi
      : palet.cizgiKil;

  return (
    <View style={styles.kap}>
      {etiketGizli ? null : (
        <Text style={[yazi.label, { color: palet.yaziSisZemin }]} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      )}
      <TextInput
        {...girisOzellikleri}
        accessibilityLabel={label}
        placeholderTextColor={palet.yaziSis}
        onFocus={(olay) => {
          setOdakli(true);
          onFocus?.(olay);
        }}
        onBlur={(olay) => {
          setOdakli(false);
          onBlur?.(olay);
        }}
        style={[
          yazi.body,
          styles.giris,
          {
            backgroundColor: palet.yuzeyKaldirim,
            borderColor: kenar,
            borderTopColor: error || odakli ? kenar : palet.kartUstIsik,
            borderBottomColor: error || odakli ? kenar : palet.kartAltTemas,
            color: palet.yaziAna,
          },
          style,
        ]}
      />
      {error ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          testID="textfield-hata"
          style={[styles.uyari, { backgroundColor: palet.tenteDolgu }]}
        >
          <Text
            style={[yazi.data, { color: palet.tenteMurekkep }]}
            maxFontSizeMultiplier={1.3}
          >
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { gap: s.s2 },
  giris: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: r.card,
    paddingHorizontal: s.s4,
    elevation: 0,
  },
  uyari: {
    alignSelf: "flex-start",
    borderRadius: r.plaque,
    paddingHorizontal: s.s2,
    paddingVertical: 3,
  },
});
