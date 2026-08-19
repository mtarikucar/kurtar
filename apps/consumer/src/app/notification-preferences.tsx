import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../design/theme";
import { r, s, yazi } from "../design/tokens";
import { PanelScreen } from "../components/panel/PanelScreen";
import { PanelHeader } from "../components/panel/PanelHeader";
import { PanelButton } from "../components/panel/PanelButton";
import { PanelLoadingState } from "../components/panel/PanelLoadingState";
import { PanelToggle } from "../components/panel/PanelToggle";
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
  const palet = usePalet();
  return (
    <View style={[styles.satir, { borderBottomColor: palet.cizgiKil }]}>
      <View style={styles.satirMetni}>
        <Text style={[yazi.bodyStrong, { color: palet.yaziAnaZemin }]}>{title}</Text>
        <Text style={[yazi.data, { color: palet.yaziSisZemin }]}>{body}</Text>
      </View>
      <PanelToggle value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

function SaatArtirici({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  return (
    <View style={styles.saatSatiri}>
      <Text style={[yazi.body, { color: palet.yaziAnaZemin }]}>{label}</Text>
      <View style={styles.saatArtirici}>
        <SaatButonu
          ikon="remove"
          etiket={`${label} azalt`}
          onPress={() => onChange(value === null ? 22 : (value + 23) % 24)}
        />
        <Text style={[yazi.dataLg, styles.saatDeger, { color: palet.yaziAnaZemin }]}>
          {value === null ? t("notificationPrefs.quietHoursOff") : `${value}:00`}
        </Text>
        <SaatButonu
          ikon="add"
          etiket={`${label} artır`}
          onPress={() => onChange(value === null ? 0 : (value + 1) % 24)}
        />
      </View>
    </View>
  );
}

/** The +/- stepper paints its own `yuzeyKaldirim`, so its glyph is card
 * type — while the value between the two buttons is on the ground. */
function SaatButonu({
  ikon,
  etiket,
  onPress,
}: {
  ikon: "add" | "remove";
  etiket: string;
  onPress: () => void;
}) {
  const palet = usePalet();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.saatButonu,
        { backgroundColor: palet.yuzeyKaldirim, borderColor: palet.cizgiKil },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={{ color: palet.yaziAna, fontSize: 18 }}>{ikon === "add" ? "+" : "−"}</Text>
    </Pressable>
  );
}

export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
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
      // [M16 fix, preserved] marketingEnabled is deliberately never sent —
      // no NotificationKind maps to it server-side (see the old
      // implementation's own note).
      ...(quietHoursStart !== null ? { quietHoursStart } : {}),
      ...(quietHoursEnd !== null ? { quietHoursEnd } : {}),
    });
    setSaved(true);
  };

  return (
    <PanelScreen padded={false}>
      <PanelHeader
        title={t("notificationPrefs.title")}
        onBack={() => router.back()}
        backLabel={t("common.back")}
      />

      {prefsQuery.isLoading ? (
        <PanelLoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.icerik}>
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
          <Text style={[yazi.title, styles.bolumBasligi, { color: palet.yaziAnaZemin }]}>
            {t("notificationPrefs.quietHours")}
          </Text>
          <Text style={[yazi.data, { color: palet.yaziSisZemin }]}>
            {t("notificationPrefs.quietHoursBody")}
          </Text>
          <SaatArtirici
            label={t("notificationPrefs.quietHoursFrom")}
            value={quietHoursStart}
            onChange={setQuietHoursStart}
          />
          <SaatArtirici
            label={t("notificationPrefs.quietHoursTo")}
            value={quietHoursEnd}
            onChange={setQuietHoursEnd}
          />

          {saved ? (
            <Text style={[yazi.data, styles.kaydedildi, { color: palet.sodyumYaziZemin }]}>
              {t("notificationPrefs.saved")}
            </Text>
          ) : null}

          <PanelButton
            label={t("common.save")}
            onPress={handleSave}
            loading={updatePrefs.isPending}
          />
        </ScrollView>
      )}
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    paddingHorizontal: s.s4,
    paddingBottom: s.s10,
    gap: s.s4,
  },
  satir: {
    flexDirection: "row",
    alignItems: "center",
    gap: s.s3,
    paddingVertical: s.s3,
    borderBottomWidth: 1,
  },
  satirMetni: { flex: 1, gap: 2 },
  bolumBasligi: { marginTop: s.s2 },
  saatSatiri: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saatArtirici: {
    flexDirection: "row",
    alignItems: "center",
    gap: s.s3,
  },
  saatDeger: {
    minWidth: 56,
    textAlign: "center",
  },
  saatButonu: {
    width: 44,
    height: 44,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  kaydedildi: { textAlign: "center" },
});
