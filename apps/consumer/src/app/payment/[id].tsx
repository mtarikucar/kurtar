import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { client } from "../../lib/api-client";
import { RESERVATIONS_QUERY_KEY } from "../../hooks/use-reservations";
import type { ReservationListResponse } from "../../lib/api-types";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_FAILURE_STATUSES = new Set([
  "CANCELLED_BY_USER",
  "CANCELLED_BY_MERCHANT",
  "EXPIRED",
]);

/**
 * The provider redirect happens in a WebView (App Store rule: this is a
 * physical good, so an external payment page is allowed — flagged for
 * store-review notes in the task report). This app never sees card data;
 * it only opens `redirectUrl` and waits for the RESULT, which it learns
 * about the same way it learns about anything else — polling the one
 * consumer-reachable read (`GET /reservations/mine`) — never by parsing
 * the WebView's URL/navigation state, which the mock provider's fake
 * `https://mock-payment.local/...` domain doesn't even support (no real
 * page is served there in this dev/test environment; see the task
 * report's verification section for how payment completion was actually
 * exercised — a direct webhook POST, mirroring the real PSP's callback).
 */
export default function PaymentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, redirectUrl, code } = useLocalSearchParams<{
    id: string;
    redirectUrl: string;
    code: string;
  }>();

  const [webViewError, setWebViewError] = useState(false);

  const pollQuery = useQuery({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: async () =>
      (await client.reservations.listMine()) as unknown as ReservationListResponse,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const mine = items.find((r) => r.id === id);
      if (!mine) return POLL_INTERVAL_MS;
      if (mine.status === "CONFIRMED" || TERMINAL_FAILURE_STATUSES.has(mine.status)) {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });

  const mine = pollQuery.data?.items.find((r) => r.id === id);
  const confirmed = mine?.status === "CONFIRMED";
  const failed = mine ? TERMINAL_FAILURE_STATUSES.has(mine.status) : false;

  const handleClose = () => {
    Alert.alert(t("payment.closeConfirmTitle"), t("payment.closeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        style: "destructive",
        onPress: () => router.replace("/(tabs)/orders"),
      },
    ]);
  };

  if (confirmed) {
    return (
      <Screen>
        <View style={styles.resultContainer}>
          <Ionicons name="checkmark-circle" size={72} color={colors.secondary[500]} />
          <Text style={styles.resultTitle}>{t("payment.success")}</Text>
          <Text style={styles.resultBody}>{t("payment.successBody")}</Text>
          <Text style={styles.code}>{code}</Text>
          <Button
            label={t("payment.viewOrderCta")}
            onPress={() => router.replace({ pathname: "/order/[id]", params: { id } })}
          />
        </View>
      </Screen>
    );
  }

  if (failed) {
    return (
      <Screen>
        <View style={styles.resultContainer}>
          <Ionicons name="close-circle" size={72} color={colors.semantic.danger[500]} />
          <Text style={styles.resultTitle}>{t("payment.failedTitle")}</Text>
          <Text style={styles.resultBody}>{t("payment.failedBody")}</Text>
          <Button label={t("common.back")} onPress={() => router.replace("/(tabs)")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t("common.close")}
          onPress={handleClose}
        />
        <Text style={styles.headerTitle}>{t("payment.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={styles.waitingText}>{t("payment.waiting")}</Text>

      {webViewError || !redirectUrl ? (
        <View style={styles.resultContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.neutral[400]} />
          <Text style={styles.resultBody}>{t("payment.loadError")}</Text>
          <Text style={styles.checkingText}>{t("payment.checking")}</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: redirectUrl }}
          style={styles.webview}
          onError={() => setWebViewError(true)}
          onHttpError={() => setWebViewError(true)}
          startInLoadingState
          renderLoading={() => <LoadingState />}
        />
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
  waitingText: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: spacing.sm,
  },
  webview: {
    flex: 1,
  },
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing["2xl"],
  },
  resultTitle: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    textAlign: "center",
  },
  resultBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
    textAlign: "center",
  },
  code: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.primary[600],
    letterSpacing: 2,
  },
  checkingText: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[500],
  },
});
