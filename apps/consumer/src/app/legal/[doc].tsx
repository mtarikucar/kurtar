import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Chip } from "../../components/Chip";
import { legalDocuments, getLegalDocument } from "../../content/legal";

/**
 * [I11/I13 fix] Was a placeholder ("Bu metnin tam hukuki içeriği yayın
 * öncesinde eklenecektir.") for a hand-picked 3-doc list that didn't even
 * match landing's real five documents — this app is the only surface
 * where a Turkish consumer actually forms a contract (landing has no
 * checkout), so it needs the real drafts, not a stand-in. Renders the
 * SAME five documents landing's /yasal/[slug] does (see content/legal/
 * index.ts's own doc comment on why this is a copy, not a live import).
 * Turkish only — this app ships no language switcher (src/i18n/index.ts).
 */
export default function LegalDocScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const active = getLegalDocument(doc ?? "") ?? legalDocuments[0];

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("legal.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.chipScroll} horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {legalDocuments.map((d) => (
            <Chip
              key={d.slug}
              label={d.title.tr}
              selected={active.slug === d.slug}
              onPress={() => router.setParams({ doc: d.slug })}
            />
          ))}
        </View>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.docTitle}>{active.title.tr}</Text>
        <Text style={styles.versionLabel}>{active.versionLabel.tr}</Text>

        {active.intro.tr.map((paragraph, i) => (
          <Text key={`intro-${i}`} style={styles.docBody}>
            {paragraph}
          </Text>
        ))}

        {active.blocks.tr.map((block, i) => (
          <View key={`block-${i}`} style={styles.block}>
            {block.heading ? (
              <Text style={styles.blockHeading}>{block.heading}</Text>
            ) : null}
            {block.paragraphs.map((paragraph, j) => (
              <Text key={`block-${i}-${j}`} style={styles.docBody}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  chipScroll: {
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  docTitle: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[900],
  },
  versionLabel: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[400],
    marginTop: -spacing.sm,
  },
  block: {
    gap: spacing.xs,
  },
  blockHeading: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
    marginTop: spacing.sm,
  },
  docBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    lineHeight: 22,
  },
});
