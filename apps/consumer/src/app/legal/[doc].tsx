import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelHeader } from "../../components/panel/PanelHeader";
import { PanelChip } from "../../components/panel/PanelChip";
import { legalDocuments, getLegalDocument } from "../../content/legal";

/**
 * The legal document reader — same five documents landing's own
 * /yasal/[slug] renders (see content/legal/index.ts's doc comment).
 * Turkish only — this app ships no language switcher.
 */
export default function LegalDocScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const active = getLegalDocument(doc ?? "") ?? legalDocuments[0];

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t("legal.title")}
        onBack={() => router.back()}
        backLabel={t("common.back")}
      />

      <ScrollView
        contentContainerStyle={styles.cipKaydirma}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.cipSatiri}>
          {legalDocuments.map((d) => (
            <PanelChip
              key={d.slug}
              label={d.title.tr}
              secili={active.slug === d.slug}
              onPress={() => router.setParams({ doc: d.slug })}
            />
          ))}
        </View>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.icerik}>
        <Text style={[yazi.title, { color: palet.yaziAnaZemin }]}>{active.title.tr}</Text>
        <Text style={[yazi.data, styles.versiyon, { color: palet.yaziSisZemin }]}>
          {active.versionLabel.tr}
        </Text>

        {active.intro.tr.map((paragraph, i) => (
          <Text key={`intro-${i}`} style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}>
            {paragraph}
          </Text>
        ))}

        {active.blocks.tr.map((block, i) => (
          <View key={`block-${i}`} style={styles.blok}>
            {block.heading ? (
              <Text style={[yazi.bodyStrong, styles.blokBasligi, { color: palet.yaziAnaZemin }]}>
                {block.heading}
              </Text>
            ) : null}
            {block.paragraphs.map((paragraph, j) => (
              <Text
                key={`block-${i}-${j}`}
                style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  cipKaydirma: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s2,
  },
  cipSatiri: {
    flexDirection: "row",
    gap: s.s2,
  },
  icerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
    gap: s.s3,
  },
  versiyon: { marginTop: -s.s2 },
  blok: { gap: s.s1 },
  blokBasligi: { marginTop: s.s2 },
  govde: { lineHeight: 22 },
});
