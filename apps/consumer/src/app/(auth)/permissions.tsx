import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { requestLocationPermission } from "../../lib/location";
import { registerPushTokenIfPermitted } from "../../lib/push";

type PermissionCardState = "idle" | "granted" | "denied";

function PermissionCard({
  icon,
  title,
  body,
  state,
  onAllow,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  state: PermissionCardState;
  onAllow: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Ionicons
        name={state === "granted" ? "checkmark-circle" : icon}
        size={28}
        color={state === "granted" ? colors.secondary[500] : colors.primary[500]}
      />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      {state === "idle" ? (
        <Button label={t("auth.permissions.allow")} onPress={onAllow} variant="secondary" />
      ) : null}
    </View>
  );
}

/**
 * Priming screen: asks for location and notification permission with
 * honest, specific copy about WHY (brief's explicit requirement) before
 * the OS prompt itself appears — an OS permission dialog with no context
 * has a much higher denial rate than one preceded by an explanation.
 * Neither permission blocks continuing: denial is handled gracefully
 * everywhere downstream (district picker on Discover, no push token
 * registered — see registerPushTokenIfPermitted's own doc comment).
 */
export default function PermissionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [locationState, setLocationState] = useState<PermissionCardState>("idle");
  const [notificationsState, setNotificationsState] =
    useState<PermissionCardState>("idle");

  const handleAllowLocation = async () => {
    const result = await requestLocationPermission();
    setLocationState(result === "granted" ? "granted" : "denied");
  };

  const handleAllowNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    setNotificationsState(granted ? "granted" : "denied");
    if (granted) {
      await registerPushTokenIfPermitted();
    }
  };

  const handleContinue = () => {
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{t("auth.permissions.title")}</Text>

        <PermissionCard
          icon="location-outline"
          title={t("auth.permissions.locationTitle")}
          body={t("auth.permissions.locationBody")}
          state={locationState}
          onAllow={handleAllowLocation}
        />

        <PermissionCard
          icon="notifications-outline"
          title={t("auth.permissions.notificationsTitle")}
          body={t("auth.permissions.notificationsBody")}
          state={notificationsState}
          onAllow={handleAllowNotifications}
        />

        <Button
          label={t("auth.permissions.continue")}
          onPress={handleContinue}
          testID="permissions-continue"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.neutral[0],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
  },
  cardBody: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
});
