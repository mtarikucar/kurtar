import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../components/Screen";
import { IconButton } from "../components/IconButton";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../hooks/use-notification-preferences";

function PreferenceRow({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ true: colors.primary[500], false: colors.neutral[200] }}
      />
    </View>
  );
}

function HourStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.hourRow}>
      <Text style={styles.hourLabel}>{label}</Text>
      <View style={styles.hourStepper}>
        <IconButton
          name="remove"
          accessibilityLabel={`${label} azalt`}
          onPress={() => onChange(value === null ? 22 : (value + 23) % 24)}
          variant="filled"
          size={16}
        />
        <Text style={styles.hourValue}>
          {value === null ? t("notificationPrefs.quietHoursOff") : `${value}:00`}
        </Text>
        <IconButton
          name="add"
          accessibilityLabel={`${label} artır`}
          onPress={() => onChange(value === null ? 0 : (value + 1) % 24)}
          variant="filled"
          size={16}
        />
      </View>
    </View>
  );
}

export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const prefsQuery = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const [favoritesEnabled, setFavoritesEnabled] = useState(true);
  const [nearbyEnabled, setNearbyEnabled] = useState(true);
  const [nearbyRadiusM, setNearbyRadiusM] = useState(3000);
  const [quietHoursStart, setQuietHoursStart] = useState<number | null>(null);
  const [quietHoursEnd, setQuietHoursEnd] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!prefsQuery.data) return;
    setFavoritesEnabled(prefsQuery.data.favoritesEnabled);
    setNearbyEnabled(prefsQuery.data.nearbyEnabled);
    setNearbyRadiusM(prefsQuery.data.nearbyRadiusM);
    setQuietHoursStart(prefsQuery.data.quietHoursStart ?? null);
    setQuietHoursEnd(prefsQuery.data.quietHoursEnd ?? null);
  }, [prefsQuery.data]);

  const handleSave = async () => {
    setSaved(false);
    await updatePrefs.mutateAsync({
      favoritesEnabled,
      nearbyEnabled,
      nearbyRadiusM,
      // [M16 fix] marketingEnabled is deliberately never sent from here
      // anymore — no NotificationKind maps to it anywhere in the backend
      // (notification-policy.table.ts), so the toggle that used to be
      // here controlled nothing: consent was captured and never
      // consulted. Removed rather than left as a false promise; see the
      // (now-deleted) PreferenceRow below's own history for why.
      //
      // PATCH cannot currently clear a quiet-hour field back to null once
      // set (backend's own documented gap — see
      // update-notification-preferences.dto.ts's doc comment) — omitting
      // the field when null leaves it unchanged server-side rather than
      // sending an invalid value.
      ...(quietHoursStart !== null ? { quietHoursStart } : {}),
      ...(quietHoursEnd !== null ? { quietHoursEnd } : {}),
    });
    setSaved(true);
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("notificationPrefs.title")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {prefsQuery.isLoading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <PreferenceRow
            title={t("notificationPrefs.favorites")}
            body={t("notificationPrefs.favoritesBody")}
            value={favoritesEnabled}
            onChange={setFavoritesEnabled}
          />
          <PreferenceRow
            title={t("notificationPrefs.nearby")}
            body={t("notificationPrefs.nearbyBody")}
            value={nearbyEnabled}
            onChange={setNearbyEnabled}
          />
          <Text style={styles.sectionTitle}>{t("notificationPrefs.quietHours")}</Text>
          <Text style={styles.sectionBody}>{t("notificationPrefs.quietHoursBody")}</Text>
          <HourStepper
            label={t("notificationPrefs.quietHoursFrom")}
            value={quietHoursStart}
            onChange={setQuietHoursStart}
          />
          <HourStepper
            label={t("notificationPrefs.quietHoursTo")}
            value={quietHoursEnd}
            onChange={setQuietHoursEnd}
          />

          {saved ? <Text style={styles.saved}>{t("notificationPrefs.saved")}</Text> : null}

          <Button
            label={t("common.save")}
            onPress={handleSave}
            loading={updatePrefs.isPending}
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
    paddingHorizontal: 20,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
  },
  rowBody: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  sectionTitle: {
    fontSize: typeScale.h3.size,
    fontWeight: typeScale.h3.weight,
    color: colors.neutral[900],
    marginTop: spacing.md,
  },
  sectionBody: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
  },
  hourRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hourLabel: {
    fontSize: typeScale.body.size,
    color: colors.neutral[700],
  },
  hourStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  hourValue: {
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.neutral[900],
    minWidth: 56,
    textAlign: "center",
  },
  saved: {
    fontSize: typeScale.caption.size,
    color: colors.secondary[600],
    textAlign: "center",
  },
});
