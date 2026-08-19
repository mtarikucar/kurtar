import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { m, r, s, yazi, type Palet } from "../../design/tokens";
import { anaYazi, sisYazi, sodyumYazisi, type YaziZemini } from "../../design/zemin";

/**
 * The chrome the three money-path screens share (spec §1.3, §4.3).
 *
 * Elevation is 0 everywhere: depth is painted, never cast — a 1pt top
 * hairline where light lands on an edge, a 1pt bottom contact edge where
 * the object meets the pavement. iOS and Android are two different
 * shadow physics engines and cannot be made to match, so neither is
 * asked to (§1.3 / §5.1). The one exception the spec allows — a sticky
 * bar floating OVER content — is `<YapiskanCubuk/>` below, and it uses
 * the platform-split token, not a shadow of its own invention.
 *
 * The entire press budget is one opacity (§5.10): no scale, no glow.
 */

/** The primary call to action: 56pt, sodium fill, `#12181F` ink, r 6. */
export function Dugme({
  etiket,
  altEtiket,
  onPress,
  palet,
  pasif = false,
  ikincil = false,
  testID,
  erisimEtiketi,
  zemin = "kart",
}: {
  etiket: string;
  altEtiket?: string;
  onPress: () => void;
  palet: Palet;
  pasif?: boolean;
  /** A quiet second action — an outline, never a second sodium fill. */
  ikincil?: boolean;
  testID?: string;
  erisimEtiketi?: string;
  /** The surface under it. The sodium-filled variant inks from its own
   * fill and does not care, but the outline variant and the sub-label
   * both borrow the surface — and this button appears on all three: the
   * sticky bar (`yuzeyYukselti`), the street (offer detail's two grey
   * buttons, the four `DurumEkrani` states, `KapandiEkrani`) and the lit
   * interior (redeem, confirmation). */
  zemin?: YaziZemini;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={erisimEtiketi ?? etiket}
        accessibilityState={{ disabled: pasif }}
        disabled={pasif}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.dugme,
          ikincil
            ? { borderColor: palet.cizgiKil, borderWidth: 1 }
            : { backgroundColor: palet.sodyumDolgu },
          pasif ? styles.pasif : null,
          pressed ? { opacity: m.pressOpacity } : null,
        ]}
      >
        <Text
          style={[
            ikincil ? yazi.label : yazi.sticker,
            { color: ikincil ? anaYazi(palet, zemin) : palet.sodyumMurekkep },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {etiket}
        </Text>
      </Pressable>
      {altEtiket ? (
        <Text
          style={[yazi.data, styles.altEtiket, { color: sisYazi(palet, zemin) }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {altEtiket}
        </Text>
      ) : null}
    </View>
  );
}

/** A section label — `ALIŞ PENCERESİ`. Pre-uppercased in tr.json; there
 * is no `textTransform` in this app, ever (§5.6). */
export function BolumBasligi({
  etiket,
  palet,
  sag,
  zemin = "sokak",
}: {
  etiket: string;
  palet: Palet;
  sag?: string;
  /** Every caller today (offer detail ×4, purchase ×2, `KapandiEkrani`)
   * puts this label directly on the street, above the block it names
   * rather than inside it — hence the default. */
  zemin?: YaziZemini;
}) {
  return (
    <View style={styles.bolumBasligi}>
      <Text
        style={[yazi.label, { color: sisYazi(palet, zemin) }]}
        maxFontSizeMultiplier={1.4}
      >
        {etiket}
      </Text>
      {sag ? (
        <Text
          style={[yazi.data, { color: sisYazi(palet, zemin) }]}
          maxFontSizeMultiplier={1.3}
        >
          {sag}
        </Text>
      ) : null}
    </View>
  );
}

/** A painted block: the pavement object every §4.3 section sits on. */
export function Blok({
  children,
  palet,
  vurgu = false,
}: {
  children: ReactNode;
  palet: Palet;
  /** The pickup-window block, which is the one the eye should land on. */
  vurgu?: boolean;
}) {
  return (
    <View
      style={[
        styles.blok,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: vurgu ? palet.sodyumDolgu : palet.kartCizgi,
          borderWidth: vurgu ? 1 : palet.kartCizgiKalinlik,
          borderTopColor: vurgu ? palet.sodyumDolgu : palet.kartUstIsik,
          borderBottomColor: vurgu ? palet.sodyumDolgu : palet.kartAltTemas,
        },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The sticky CTA bar. §1.3's ONE exception to the no-shadow doctrine:
 * a surface that floats over content and must be unambiguously separated
 * from it. The Android half is a hard contact edge with no spread, so the
 * two platforms still read the same.
 */
export function YapiskanCubuk({
  children,
  palet,
}: {
  children: ReactNode;
  palet: Palet;
}) {
  return (
    <View
      style={[
        styles.yapiskan,
        YUZEN,
        { backgroundColor: palet.yuzeyYukselti, borderTopColor: palet.bgDerin },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * §1.3's single sanctioned exception to `elevation: 0` — and it is
 * spelled out per platform rather than left to a shared abstraction,
 * because that is exactly the number the spec publishes. Android takes a
 * hard contact edge with no spread so it does not diverge from iOS.
 */
const YUZEN = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },
  android: { elevation: 8 },
  default: {},
});

/** A back / favourite / share affordance. Drawn, not iconfont: this app
 * ships three families and none of them is an icon set. */
export function IkonDugmesi({
  yol,
  etiket,
  onPress,
  palet,
  doldur = false,
  testID,
  zemin = "sokak",
}: {
  yol: string;
  etiket: string;
  onPress: () => void;
  palet: Palet;
  doldur?: boolean;
  testID?: string;
  /** A 1.8pt stroke is a graphic, not type, so its floor is 3:1 — but it
   * is still drawn on a ground and still has to change with it. Offer
   * detail, purchase and payment put it on the street; redeem puts it on
   * the recess. */
  zemin?: YaziZemini;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      onPress={onPress}
      testID={testID}
      hitSlop={10}
      style={({ pressed }) => [
        styles.ikon,
        pressed ? { opacity: m.pressOpacity } : null,
      ]}
    >
      <Svg width={24} height={24}>
        <Path
          d={yol}
          stroke={doldur ? sodyumYazisi(palet, zemin) : anaYazi(palet, zemin)}
          fill={doldur ? palet.sodyumDolgu : "none"}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

export const IKON = Object.freeze({
  geri: "M15 4 L7 12 L15 20",
  kalp:
    "M12 20 C5 15 3 11 3 8.2 A4.6 4.6 0 0 1 12 6 A4.6 4.6 0 0 1 21 8.2 C21 11 19 15 12 20 Z",
  paylas: "M12 16 V3 M8 7 L12 3 L16 7 M5 12 V20 H19 V12",
  harita: "M3 6 L9 3 L15 6 L21 3 V18 L15 21 L9 18 L3 21 Z M9 3 V18 M15 6 V21",
  yon: "M12 21 V9 M6 9 L12 3 L18 9 M4 21 H20",
  kilit: "M6 11 H18 V21 H6 Z M9 11 V7 A3 3 0 0 1 15 7 V11",
  saat: "M12 3 A9 9 0 1 1 12 21 A9 9 0 1 1 12 3 Z M12 7 V12 L16 14",
});

const styles = StyleSheet.create({
  dugme: {
    height: 56,
    borderRadius: r.cta,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s4,
    elevation: 0,
  },
  pasif: { opacity: 0.4 },
  altEtiket: { marginTop: s.s2, textAlign: "center" },
  bolumBasligi: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: s.s2,
  },
  blok: {
    borderRadius: r.card,
    padding: s.s4,
    gap: s.s2,
    elevation: 0,
  },
  yapiskan: {
    paddingHorizontal: s.s4,
    paddingTop: s.s3,
    paddingBottom: s.s4,
    borderTopWidth: 1,
  },
  ikon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
