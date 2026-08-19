import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { s, yazi, type Palet } from "../../design/tokens";
import { kodParcalari } from "./perde";

/**
 * The pickup code (spec §4.5).
 *
 * A four-character speakable code and not a QR, because half these shops
 * are a fırın counter with flour on the phone: a code you can SAY
 * survives a cracked screen, a dead camera and a dark corner, and it is
 * keyable into the merchant tablet. It also does not exist on screen
 * until the shutter is open, which is a structural anti-fraud property
 * rather than a cosmetic one — a screenshot of the closed state is a
 * picture of a closed shop and nothing else.
 *
 * The server's code is `K-7F3M`: a fixed prefix every code in the system
 * shares, plus four characters from an alphabet that excludes 0/O/1/I.
 * The four informative ones get the 44pt type; the prefix stays with the
 * whole string on the ticket line, so a staff member matching against
 * their own tablet still sees every character. Nothing here reformats or
 * re-derives the code.
 */
export function Kod({ kod, palet }: { kod: string; palet: Palet }) {
  const { t } = useTranslation();
  const parcalar = kodParcalari(kod);

  return (
    <View
      style={styles.kap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={[yazi.label, styles.etiket, { color: palet.yaziSis }]}
        maxFontSizeMultiplier={1.3}
      >
        {t("kepenk.kodEtiketi")}
      </Text>
      <View style={styles.haneler}>
        {parcalar.haneler.map((hane, i) => (
          <Text
            key={`${hane}-${i}`}
            testID="kepenk-kod-hanesi"
            style={[yazi.code, styles.hane, { color: palet.yaziAna }]}
            maxFontSizeMultiplier={yazi.code.maxFontSizeMultiplier}
          >
            {hane}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { alignItems: "center" },
  // "KURTAR" is a pre-uppercased key in tr.json — never a transform.
  etiket: { letterSpacing: 4 },
  haneler: { flexDirection: "row", marginTop: s.s1 },
  // Chivo Mono already sets the digits on a fixed advance; the extra
  // tracking is what turns a number into four separately speakable
  // characters at arm's length.
  hane: { marginHorizontal: s.s2 },
});
