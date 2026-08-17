import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  isOfferUnavailableError,
  useCreateReservation,
} from "../../hooks/use-reservations";
import { formatPriceCents } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { savePurchaseSnapshot } from "../../lib/purchase-cache";

const MAX_QTY = 5;

export default function PurchaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { offerId, storeId } = useLocalSearchParams<{
    offerId: string;
    storeId: string;
  }>();

  const storeQuery = useStoreProfile(storeId ?? null);
  const offer = storeQuery.data?.todaysOffers.find((o) => o.offerId === offerId);

  const [qty, setQty] = useState(1);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [I13 fix] Required, unchecked by default — the pre-contract
  // disclosure this purchase screen used to have NONE of: no ÖBF/MSS
  // link, no acknowledgement control, straight from a quantity stepper
  // to "Ödemeye geç". This is the only place a Turkish consumer actually
  // enters a distance contract (landing has no checkout).
  const [consentChecked, setConsentChecked] = useState(false);
  const createReservation = useCreateReservation();

  const maxQty = Math.min(MAX_QTY, offer?.qtyLeft ?? MAX_QTY);

  const handleConfirm = async () => {
    if (!offer || !storeQuery.data || !offerId || !consentChecked) return;
    setError(null);
    try {
      const result = await createReservation.mutateAsync({ offerId, qty });
      await savePurchaseSnapshot(result.reservationId, {
        storeName: storeQuery.data.store.name,
        storeDistrict: storeQuery.data.store.district,
        bagTitle: offer.template.title,
        coverImageUrl: storeQuery.data.store.coverImageUrl,
        pickupStartAt: offer.pickupStartAt,
        pickupEndAt: offer.pickupEndAt,
      });
      router.replace({
        pathname: "/payment/[id]",
        params: {
          id: result.reservationId,
          redirectUrl: result.payment.redirectUrl ?? "",
          code: result.code,
        },
      });
    } catch (err) {
      if (isOfferUnavailableError(err)) {
        setUnavailable(true);
      } else {
        setError(getErrorMessage(err, t));
      }
    }
  };

  if (unavailable) {
    return (
      <Screen>
        <EmptyState
          icon="sad-outline"
          title={t("purchase.unavailableTitle")}
          body={t("purchase.unavailableBody")}
          ctaLabel={t("purchase.backToDiscoverCta")}
          onPressCta={() => router.replace("/(tabs)")}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("purchase.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {storeQuery.isLoading ? (
        <LoadingState />
      ) : !offer ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t("offerDetail.loadError")}
          ctaLabel={t("offerDetail.backToDiscover")}
          onPressCta={() => router.replace("/(tabs)")}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.bagTitle}>{offer.template.title}</Text>
          <Text style={styles.quantityLabel}>{t("purchase.quantityTitle")}</Text>

          <View style={styles.stepper}>
            <IconButton
              name="remove"
              accessibilityLabel="Azalt"
              onPress={() => setQty((prev) => Math.max(1, prev - 1))}
              disabled={qty <= 1}
              variant="filled"
            />
            <Text style={styles.qtyValue} testID="purchase-qty">
              {qty}
            </Text>
            <IconButton
              name="add"
              accessibilityLabel="Artır"
              onPress={() => setQty((prev) => Math.min(maxQty, prev + 1))}
              disabled={qty >= maxQty}
              variant="filled"
            />
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t("purchase.total")}</Text>
            <Text style={styles.totalValue}>
              {formatPriceCents(offer.template.priceCents * qty)}
            </Text>
          </View>

          <View style={styles.preContract}>
            <Text style={styles.preContractTitle}>{t("purchase.preContractTitle")}</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/legal/[doc]",
                  params: { doc: "on-bilgilendirme-formu" },
                })
              }
              accessibilityRole="link"
            >
              <Text style={styles.preContractLink}>{t("purchase.preContractObf")}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/legal/[doc]",
                  params: { doc: "mesafeli-satis-sozlesmesi" },
                })
              }
              accessibilityRole="link"
            >
              <Text style={styles.preContractLink}>{t("purchase.preContractMss")}</Text>
            </Pressable>

            <Pressable
              style={styles.consentRow}
              onPress={() => setConsentChecked((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consentChecked }}
              testID="purchase-consent-checkbox"
            >
              <Ionicons
                name={consentChecked ? "checkbox" : "square-outline"}
                size={22}
                color={consentChecked ? colors.primary[500] : colors.neutral[400]}
              />
              <Text style={styles.consentLabel}>{t("purchase.consentLabel")}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t("purchase.confirmCta")}
            onPress={handleConfirm}
            loading={createReservation.isPending}
            disabled={!consentChecked}
            testID="purchase-confirm"
          />
        </ScrollView>
      )}
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
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    justifyContent: "center",
  },
  bagTitle: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    textAlign: "center",
  },
  quantityLabel: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    textAlign: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  qtyValue: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.neutral[900],
    minWidth: 48,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[50],
  },
  totalLabel: {
    fontSize: typeScale.bodyStrong.size,
    color: colors.neutral[700],
  },
  totalValue: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.primary[600],
  },
  error: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.danger[500],
    textAlign: "center",
  },
  preContract: {
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.neutral[50],
    gap: spacing.xs,
  },
  preContractTitle: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
    color: colors.neutral[600],
  },
  preContractLink: {
    fontSize: typeScale.caption.size,
    color: colors.primary[600],
    textDecorationLine: "underline",
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  consentLabel: {
    flex: 1,
    fontSize: typeScale.caption.size,
    color: colors.neutral[700],
    lineHeight: 18,
  },
});
