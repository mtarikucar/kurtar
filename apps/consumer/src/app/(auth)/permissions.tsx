import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { requestLocationPermission } from "../../lib/location";
import { registerPushTokenIfPermitted } from "../../lib/push";

type IzinDurumu = "idle" | "granted" | "denied";

/**
 * One permission, as a pavement block: the card surface, the painted
 * chassis, no shadow.
 *
 * A granted permission lights up in SODIUM, never in a green tick. Rescue
 * — and every yes in this app — is expressed as light (§1.1 / §5.9), and
 * the green checkmark this screen used to draw was the only green pixel
 * in the whole product.
 */
function IzinKarti({
  icon,
  title,
  body,
  durum,
  onAllow,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  durum: IzinDurumu;
  onAllow: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const verildi = durum === "granted";

  return (
    <View
      style={[
        styles.kart,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderWidth: palet.kartCizgiKalinlik,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderTopColor: verildi ? palet.sodyumDolgu : palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
      ]}
    >
      <Ionicons
        name={verildi ? "checkmark-circle" : icon}
        size={26}
        color={verildi ? palet.sodyumYazi : palet.yaziSis}
      />
      <Text style={[yazi.title, { color: palet.yaziAna }]}>{title}</Text>
      <Text style={[yazi.body, { color: palet.yaziSis }]}>{body}</Text>
      {durum === "idle" ? (
        <Button
          label={t("auth.permissions.allow")}
          onPress={onAllow}
          varyant="ikincil"
          style={styles.izinDugmesi}
        />
      ) : null}
    </View>
  );
}

/**
 * Priming screen: asks for location and notification permission with
 * honest, specific copy about WHY before the OS prompt itself appears —
 * an OS permission dialog with no context has a much higher denial rate
 * than one preceded by an explanation. Neither permission blocks
 * continuing: denial is handled gracefully everywhere downstream (the
 * district picker on Keşfet and Ara, no push token registered — see
 * registerPushTokenIfPermitted's own doc comment).
 */
export default function PermissionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const [konumDurumu, setKonumDurumu] = useState<IzinDurumu>("idle");
  const [bildirimDurumu, setBildirimDurumu] = useState<IzinDurumu>("idle");

  const handleAllowLocation = async () => {
    const result = await requestLocationPermission();
    setKonumDurumu(result === "granted" ? "granted" : "denied");
  };

  const handleAllowNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    setBildirimDurumu(granted ? "granted" : "denied");
    if (granted) {
      await registerPushTokenIfPermitted();
    }
  };

  const handleContinue = () => {
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.icerik}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
          {t("auth.permissions.title")}
        </Text>

        <IzinKarti
          icon="location-outline"
          title={t("auth.permissions.locationTitle")}
          body={t("auth.permissions.locationBody")}
          durum={konumDurumu}
          onAllow={handleAllowLocation}
        />

        <IzinKarti
          icon="notifications-outline"
          title={t("auth.permissions.notificationsTitle")}
          body={t("auth.permissions.notificationsBody")}
          durum={bildirimDurumu}
          onAllow={handleAllowNotifications}
        />

        <Button
          label={t("auth.permissions.continue")}
          onPress={handleContinue}
          testID="permissions-continue"
          style={styles.devam}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: s.s6,
    gap: s.s4,
  },
  baslik: { textAlign: "center" },
  kart: {
    borderRadius: r.card,
    padding: s.s4,
    gap: s.s2,
    elevation: 0,
  },
  izinDugmesi: { marginTop: s.s2 },
  devam: { marginTop: s.s2 },
});
