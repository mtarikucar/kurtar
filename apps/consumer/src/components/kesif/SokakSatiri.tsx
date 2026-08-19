import { StyleSheet, Text, View } from "react-native";
import { mesafeMetni } from "../kepenk";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import {
  SPINE_BOSLUK,
  SPINE_ETIKET_GENISLIGI,
  SPINE_HAIRLINE_GENISLIGI,
} from "./duzen";

/**
 * SOKAK SATIRI — the street spine (spec §4.1).
 *
 * "A 1pt line.hairline rule down the left gutter with mono distance
 * labels … pinned beside each card. Scrolling down is walking away from
 * where you stand." One `View` + one `Text` per card, exactly as costed.
 *
 * `mesafeM: null` renders the same column with the hairline but no
 * number — the loading placeholder's frame (spec §4.8: "no distance
 * spine … a distance is real data this frame does not have yet"). The
 * GEOMETRY still has to match the loaded row exactly, or the list
 * reflows the moment data lands (reviewed and fixed — see build log);
 * only the number, which would be a lie, is withheld.
 */
export function SokakSatiri({
  mesafeM,
  children,
}: {
  mesafeM: number | null;
  children: React.ReactNode;
}) {
  const palet = usePalet();
  return (
    <View style={styles.satir}>
      <View style={styles.spine}>
        {mesafeM !== null ? (
          <Text
            style={[yazi.data, styles.etiket, { color: palet.yaziSis }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {mesafeMetni(mesafeM)}
          </Text>
        ) : (
          <View style={styles.etiket} />
        )}
        <View style={[styles.hairline, { backgroundColor: palet.cizgiKil }]} />
      </View>
      <View style={styles.kart}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  satir: { flexDirection: "row" },
  spine: {
    width: SPINE_ETIKET_GENISLIGI + SPINE_BOSLUK + SPINE_HAIRLINE_GENISLIGI,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: s.s3,
  },
  etiket: { width: SPINE_ETIKET_GENISLIGI, textAlign: "right" },
  hairline: {
    width: SPINE_HAIRLINE_GENISLIGI,
    height: "100%",
    marginLeft: SPINE_BOSLUK,
  },
  kart: { marginLeft: SPINE_BOSLUK },
});
