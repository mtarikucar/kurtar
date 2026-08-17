import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { useStoreProfile } from "../../hooks/use-discovery";
import {
  formatDistance,
  formatPickupWindow,
  formatPriceCents,
  formatValueBand,
} from "../../lib/format";
import { CANCEL_DEADLINE_BEFORE_PICKUP_MS } from "../../lib/constants";

const CANCEL_DEADLINE_HOURS = CANCEL_DEADLINE_BEFORE_PICKUP_MS / (60 * 60 * 1000);

export default function OfferDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, storeId, distanceM } = useLocalSearchParams<{
    id: string;
    storeId: string;
    distanceM?: string;
  }>();

  const storeProfileQuery = useStoreProfile(storeId ?? null);
  const offer = storeProfileQuery.data?.todaysOffers.find((o) => o.offerId === id);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("offerDetail.title")}</Text>
        <IconButton
          name="flag-outline"
          accessibilityLabel={t("report.title.OFFER")}
          testID="offer-report-cta"
          onPress={() =>
            router.push({
              pathname: "/report/new",
              params: { targetType: "OFFER", targetId: id },
            })
          }
        />
      </View>

      {storeProfileQuery.isLoading ? (
        <LoadingState />
      ) : !offer || !storeProfileQuery.data ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t("offerDetail.loadError")}
          ctaLabel={t("offerDetail.backToDiscover")}
          onPressCta={() => router.replace("/(tabs)")}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {storeProfileQuery.data.store.coverImageUrl ? (
              <Image
                source={{ uri: storeProfileQuery.data.store.coverImageUrl }}
                style={styles.cover}
              />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Text style={styles.coverFallbackText}>🥡</Text>
              </View>
            )}

            <Text style={styles.storeName}>{storeProfileQuery.data.store.name}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="star" size={14} color={colors.primary[500]} />
              <Text style={styles.metaText}>
                {storeProfileQuery.data.rating.count > 0
                  ? `${storeProfileQuery.data.rating.average.toFixed(1)} (${storeProfileQuery.data.rating.count})`
                  : t("offerDetail.noRatingYet")}
              </Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{storeProfileQuery.data.store.district}</Text>
              {distanceM ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>{formatDistance(Number(distanceM))}</Text>
                </>
              ) : null}
            </View>

            <Text style={styles.bagTitle}>{offer.template.title}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatPriceCents(offer.template.priceCents)}</Text>
              <Text style={styles.valueBand}>
                {formatValueBand(
                  offer.template.originalValueCentsMin,
                  offer.template.originalValueCentsMax,
                )}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color={colors.neutral[600]} />
              <Text style={styles.infoText}>
                {formatPickupWindow(offer.pickupStartAt, offer.pickupEndAt)}
              </Text>
            </View>

            <Section
              icon="gift-outline"
              title={t("offerDetail.surpriseTitle")}
              body={t("offerDetail.surpriseBody")}
            />
            <Section
              icon="warning-outline"
              title={t("offerDetail.allergenTitle")}
              // [I12 fix] The merchant's OWN allergen text (mandatory at
              // submit — CreateBagTemplateDto.allergenDisclaimer) shown
              // pre-purchase, not the generic "coming soon" placeholder —
              // falls back to it only when a template genuinely has no
              // text (shouldn't happen given it's required at submit, but
              // never silently blank).
              body={
                offer.template.allergenDisclaimer.trim().length > 0
                  ? offer.template.allergenDisclaimer
                  : t("offerDetail.allergenBody")
              }
              tone="warning"
            />
            <Section
              icon="return-down-back-outline"
              title={t("offerDetail.noRefundTitle")}
              body={t("offerDetail.noRefundBody", { hours: CANCEL_DEADLINE_HOURS })}
              tone="danger"
            />

            <Button
              label={t("offerDetail.viewStoreCta")}
              variant="ghost"
              onPress={() => router.push({ pathname: "/store/[id]", params: { id: storeId } })}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label={
                offer.qtyLeft > 0
                  ? t("offerDetail.buyCta", {
                      price: formatPriceCents(offer.template.priceCents),
                    })
                  : t("offerDetail.soldOutCta")
              }
              disabled={offer.qtyLeft <= 0}
              onPress={() =>
                router.push({
                  pathname: "/purchase/[offerId]",
                  params: { offerId: id, storeId },
                })
              }
              testID="offer-buy-cta"
            />
          </View>
        </>
      )}
    </Screen>
  );
}

function Section({
  icon,
  title,
  body,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <View style={[styles.section, sectionTone[tone]]}>
      <View style={styles.sectionHeader}>
        <Ionicons
          name={icon}
          size={18}
          color={
            tone === "warning"
              ? colors.semantic.warning[700]
              : tone === "danger"
                ? colors.semantic.danger[700]
                : colors.neutral[700]
          }
        />
        <Text
          style={[
            styles.sectionTitle,
            tone === "warning" && { color: colors.semantic.warning[700] },
            tone === "danger" && { color: colors.semantic.danger[700] },
          ]}
        >
          {title}
        </Text>
      </View>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

const sectionTone = StyleSheet.create({
  neutral: { backgroundColor: colors.neutral[50] },
  warning: { backgroundColor: colors.semantic.warning[50] },
  danger: { backgroundColor: colors.semantic.danger[50] },
});

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
  content: {
    paddingHorizontal: 20,
    paddingBottom: spacing["4xl"],
    gap: spacing.sm,
  },
  cover: {
    width: "100%",
    height: 180,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  coverFallback: {
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  coverFallbackText: {
    fontSize: 48,
  },
  storeName: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[900],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  metaDot: {
    color: colors.neutral[400],
  },
  bagTitle: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    marginTop: spacing.sm,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  price: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.primary[600],
  },
  valueBand: {
    fontSize: typeScale.body.size,
    color: colors.neutral[400],
    textDecorationLine: "line-through",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoText: {
    fontSize: typeScale.body.size,
    color: colors.neutral[700],
  },
  section: {
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  sectionBody: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[700],
    lineHeight: 20,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.neutral[0],
  },
});
