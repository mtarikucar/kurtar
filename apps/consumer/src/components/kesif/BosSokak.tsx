import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePalet } from "../../design/theme";
import { kart, r, s, yazi } from "../../design/tokens";
import { KapaliKart } from "./KapaliKart";

export type BosSokakTuru = "gece" | "gunduz" | "filtreli";

/**
 * SOKAK — BOŞ (spec §4.8).
 *
 * Three honest variants, all built from the same closed-shutter picture
 * as the loading state — a street with nothing open right now is not a
 * different metaphor from a street that hasn't finished loading, it's
 * the same one with a reason attached:
 *  - gece: "kepenkler indi" + a real countdown to tomorrow + a bell.
 *  - gündüz: "henüz erken" + the same bell.
 *  - filtreli: the filter, not the hour, is why the street is empty —
 *    the CTA clears the filter instead of promising a bell.
 */
export function BosSokak({
  tur,
  geriSayimMetni,
  kartGenisligi = kart.genislik,
  onFiltreleriTemizle,
}: {
  tur: BosSokakTuru;
  /** Only used by the `gece` variant — a real computed countdown, never a
   * placeholder. */
  geriSayimMetni?: string;
  kartGenisligi?: number;
  onFiltreleriTemizle?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();

  const baslik =
    tur === "gece"
      ? t("kesif.bosGeceBaslik")
      : tur === "gunduz"
        ? t("kesif.bosGunduzBaslik")
        : t("kesif.bosFiltre");
  const govde =
    tur === "gece" ? t("kesif.bosGeceGovde") : tur === "gunduz" ? t("kesif.bosGunduzGovde") : null;

  return (
    <View style={styles.kok}>
      <View style={styles.kartlar}>
        <KapaliKart genislik={kartGenisligi} />
      </View>

      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAna }]}>{baslik}</Text>
      {govde ? (
        <Text style={[yazi.body, styles.govde, { color: palet.yaziSis }]}>{govde}</Text>
      ) : null}
      {tur === "gece" && geriSayimMetni ? (
        <Text style={[yazi.data, styles.geriSayim, { color: palet.sodyumYazi }]}>
          {t("kesif.bosGeceGeriSayim", { sure: geriSayimMetni })}
        </Text>
      ) : null}

      {tur === "filtreli" ? (
        <Cta label={t("kesif.filtreleriTemizle")} onPress={onFiltreleriTemizle} palet={palet} />
      ) : (
        <Cta
          label={t("kesif.haberVer")}
          onPress={() => router.push("/notification-preferences")}
          palet={palet}
        />
      )}
    </View>
  );
}

function Cta({
  label,
  onPress,
  palet,
}: {
  label: string;
  onPress?: () => void;
  palet: ReturnType<typeof usePalet>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.cta,
        { borderColor: palet.cizgiKil },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <Text style={[yazi.bodyStrong, { color: palet.yaziAna }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kok: { alignItems: "center", paddingHorizontal: s.s4, paddingTop: s.s4 },
  kartlar: { marginBottom: s.s6 },
  baslik: { textAlign: "center" },
  govde: { textAlign: "center", marginTop: s.s2, paddingHorizontal: s.s4 },
  geriSayim: { marginTop: s.s3 },
  cta: {
    marginTop: s.s6,
    minHeight: 44,
    paddingHorizontal: s.s5,
    borderRadius: r.cta,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
