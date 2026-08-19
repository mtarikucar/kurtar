import { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { usePalet } from "../../design/theme";
import { s, r, yazi } from "../../design/tokens";
import { PanelScreen } from "../../components/panel/PanelScreen";
import { PanelLoadingState } from "../../components/panel/PanelLoadingState";
import { PanelButton } from "../../components/panel/PanelButton";
import { SeninSokagin } from "../../components/sokak/SeninSokagin";
import type { KurtarmaKaydi } from "../../components/sokak/sokak-hesap";
import { enCokGidilenDukkan, enSikSaat } from "../../components/sokak/sokak-hesap";
import { fiyatMetni } from "../../components/kepenk/olcum";
import { useAuth } from "../../lib/auth-context";
import { useImpact } from "../../hooks/use-impact";
import { useReservations } from "../../hooks/use-reservations";
import { useStoreNames } from "../../hooks/use-store-names";
import { formatKg } from "../../lib/format";

/** A row INSIDE the menu card (`styles.menu` paints `yuzeyKaldirim`), so
 * this is the one place on this screen that keeps card type. */
function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const palet = usePalet();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.menuSatiri,
        { borderBottomColor: palet.cizgiKil },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={20} color={palet.yaziSis} />
      <Text style={[yazi.body, styles.menuEtiket, { color: palet.yaziAna }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={palet.yaziSis} />
    </Pressable>
  );
}

/**
 * PROFİL / ETKİ — spec §4.7. SENİN SOKAĞIN is the reward loop of the whole
 * product: every REDEEMED reservation becomes one storefront. The three
 * headline numbers (paket / kg / ₺) are rendered exactly as `GET
 * /me/impact` returns them — never recomputed from the reservation list,
 * which is used ONLY for the street's shape and the two derived lines
 * ("en sık kurtardığın saat", "en çok gittiğin dükkân") that have no
 * backend endpoint of their own.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { user, logout } = useAuth();
  const impactQuery = useImpact();
  const reservationsQuery = useReservations();

  const kayitlar = useMemo<KurtarmaKaydi[]>(() => {
    const items = reservationsQuery.data?.items ?? [];
    return items
      .filter((it) => it.status === "REDEEMED" && it.redeemedAt)
      .map((it) => ({
        reservationId: it.id,
        storeId: it.storeId,
        redeemedAt: new Date(it.redeemedAt!),
      }));
  }, [reservationsQuery.data]);

  const storeIds = useMemo(() => kayitlar.map((k) => k.storeId), [kayitlar]);
  const { adGetir } = useStoreNames(storeIds);

  const enSikSaatDegeri = useMemo(() => enSikSaat(kayitlar), [kayitlar]);
  const enCokGidilen = useMemo(() => enCokGidilenDukkan(kayitlar), [kayitlar]);

  const handleLogout = () => {
    Alert.alert(t("profile.logoutConfirmTitle"), undefined, [
      { text: t("common.no"), style: "cancel" },
      { text: t("common.yes"), style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <PanelScreen>
      <ScrollView contentContainerStyle={styles.icerik}>
        <Text style={[yazi.title, { color: palet.yaziAnaZemin }]}>{t("profile.title")}</Text>
        {user ? (
          <Text style={[yazi.data, { color: palet.yaziSisZemin }]}>
            {t("profile.guestPhone", { phone: user.phone })}
          </Text>
        ) : null}

        <View style={styles.sokakBolumu}>
          <View style={styles.sokakBasligi}>
            <Text style={[yazi.label, { color: palet.yaziAnaZemin }]}>{t("profile.sokakBaslik")}</Text>
          </View>

          {reservationsQuery.isLoading ? (
            <PanelLoadingState />
          ) : (
            <SeninSokagin kayitlar={kayitlar} dukkanAdi={adGetir} />
          )}

          {impactQuery.data ? (
            <View style={styles.istatistikSatiri}>
              <Istatistik
                deger={t("profile.statPaketDeger", { count: impactQuery.data.mealsSaved })}
                etiket={t("profile.statPaketEtiket")}
              />
              <Istatistik
                deger={t("profile.statKgDeger", { kg: formatKg(impactQuery.data.co2eGrams) })}
                etiket={t("profile.statKgEtiket")}
              />
              <Istatistik
                deger={fiyatMetni(impactQuery.data.moneySavedCents)}
                etiket={t("profile.statParaEtiket")}
              />
            </View>
          ) : null}

          {enSikSaatDegeri || enCokGidilen ? (
            <View style={[styles.metaBlok, { borderTopColor: palet.cizgiKil }]}>
              {enSikSaatDegeri ? (
                <View style={styles.metaSatiri}>
                  <Text style={[yazi.body, { color: palet.yaziSisZemin }]}>
                    {t("profile.enSikSaatEtiket")}
                  </Text>
                  <Text style={[yazi.dataLg, { color: palet.sodyumYaziZemin }]}>
                    {enSikSaatDegeri}
                  </Text>
                </View>
              ) : null}
              {enCokGidilen ? (
                <View style={styles.metaSutunu}>
                  <Text style={[yazi.body, { color: palet.yaziSisZemin }]}>
                    {t("profile.enCokGidilenDukkanEtiket")}
                  </Text>
                  <Text
                    style={[yazi.dataLg, styles.metaDeger, { color: palet.sodyumYaziZemin }]}
                    numberOfLines={1}
                  >
                    {t("profile.enCokGidilenDukkanDeger", {
                      ad: adGetir(enCokGidilen.storeId) ?? t("orders.unknownStoreName"),
                      sayac: enCokGidilen.sayac,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={[yazi.label, styles.menuBaslik, { color: palet.yaziSisZemin }]}>
          {t("profile.menuBaslik")}
        </Text>
        <View
          style={[
            styles.menu,
            { backgroundColor: palet.yuzeyKaldirim, borderColor: palet.cizgiKil },
          ]}
        >
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
            icon="chatbubble-ellipses-outline"
            label={t("complaints.title")}
            onPress={() => router.push("/complaints")}
          />
          <MenuRow
            icon="document-text-outline"
            label={t("profile.legal")}
            onPress={() =>
              router.push({
                pathname: "/legal/[doc]",
                params: { doc: "mesafeli-satis-sozlesmesi" },
              })
            }
          />
        </View>

        <View style={styles.cikisAlani}>
          <PanelButton varyant="tehlike" label={t("profile.logout")} onPress={handleLogout} />
        </View>
      </ScrollView>
    </PanelScreen>
  );
}

function Istatistik({ deger, etiket }: { deger: string; etiket: string }) {
  const palet = usePalet();
  return (
    <View style={styles.istatistik}>
      <Text
        style={[yazi.dataLg, { color: palet.sodyumYaziZemin }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {deger}
      </Text>
      <Text style={[yazi.data, styles.istatistikEtiket, { color: palet.yaziSisZemin }]}>
        {etiket}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icerik: {
    gap: s.s5,
    paddingBottom: s.s10,
  },
  sokakBolumu: { gap: s.s4 },
  sokakBasligi: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  istatistikSatiri: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  istatistik: { alignItems: "center", flex: 1, gap: 2 },
  istatistikEtiket: { textAlign: "center" },
  metaBlok: {
    borderTopWidth: 1,
    paddingTop: s.s3,
    gap: s.s2,
  },
  metaSatiri: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: s.s2,
  },
  // Stacked, not a row: the shop name + count can run long, and a fixed
  // two-column split truncates mid-word at some name lengths. A label
  // above its value never clips, whatever the name.
  metaSutunu: { gap: 2 },
  metaDeger: { textAlign: "left" },
  menuBaslik: { marginTop: s.s2 },
  menu: {
    borderRadius: r.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuSatiri: {
    flexDirection: "row",
    alignItems: "center",
    gap: s.s3,
    minHeight: 52,
    paddingHorizontal: s.s4,
    borderBottomWidth: 1,
  },
  menuEtiket: { flex: 1 },
  cikisAlani: { marginTop: s.s2 },
});
