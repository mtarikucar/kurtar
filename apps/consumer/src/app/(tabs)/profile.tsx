import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { LoadingState } from "../../components/LoadingState";
import { useAuth } from "../../lib/auth-context";
import { useImpact } from "../../hooks/use-impact";
import { formatKg, formatPriceCents } from "../../lib/format";

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <Ionicons name={icon} size={20} color={colors.neutral[700]} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, logout } = useAuth();
  const impactQuery = useImpact();

  const handleLogout = () => {
    Alert.alert(t("profile.logoutConfirmTitle"), undefined, [
      { text: t("common.no"), style: "cancel" },
      { text: t("common.yes"), style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t("profile.title")}</Text>
        {user ? (
          <Text style={styles.phone}>{t("profile.guestPhone", { phone: user.phone })}</Text>
        ) : null}

        <View style={styles.impactCard}>
          <Text style={styles.impactTitle}>{t("profile.impactTitle")}</Text>
          {impactQuery.isLoading ? (
            <LoadingState />
          ) : impactQuery.data ? (
            <View style={styles.impactStats}>
              <View style={styles.impactStat}>
                <Text style={styles.impactValue}>{impactQuery.data.mealsSaved}</Text>
                <Text style={styles.impactLabel}>
                  {t("profile.mealsSaved", { count: impactQuery.data.mealsSaved })}
                </Text>
              </View>
              <View style={styles.impactStat}>
                <Text style={styles.impactValue}>
                  {formatKg(impactQuery.data.co2eGrams)} kg
                </Text>
                <Text style={styles.impactLabel}>CO2e</Text>
              </View>
              <View style={styles.impactStat}>
                <Text style={styles.impactValue}>
                  {formatPriceCents(impactQuery.data.moneySavedCents)}
                </Text>
                <Text style={styles.impactLabel}>{t("profile.moneySavedLabel")}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.menu}>
          <MenuRow
            icon="notifications-outline"
            label={t("profile.notificationPrefs")}
            onPress={() => router.push("/notification-preferences")}
          />
          <MenuRow
            icon="alert-circle-outline"
            label={t("profile.complaint")}
            onPress={() => router.push("/complaint/new")}
          />
          <MenuRow
            icon="document-text-outline"
            label={t("profile.legal")}
            onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "terms" } })}
          />
        </View>

        <Pressable
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t("profile.logout")}
          style={styles.logoutRow}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.semantic.danger[500]} />
          <Text style={styles.logoutLabel}>{t("profile.logout")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  phone: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
  impactCard: {
    backgroundColor: colors.secondary[50],
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  impactTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.secondary[700],
  },
  impactStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  impactStat: {
    alignItems: "center",
    gap: 2,
  },
  impactValue: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.secondary[700],
  },
  impactLabel: {
    fontSize: typeScale.caption.size,
    color: colors.secondary[700],
    textAlign: "center",
  },
  menu: {
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[0],
    borderWidth: 1,
    borderColor: colors.neutral[100],
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[50],
  },
  menuRowPressed: {
    backgroundColor: colors.neutral[50],
  },
  menuLabel: {
    flex: 1,
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
  },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
  },
  logoutLabel: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.semantic.danger[500],
  },
});
