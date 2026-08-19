import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { usePalet } from "../design/theme";
import { useSimdi } from "../design/saat";
import { useReduceMotion } from "../design/reduce-motion";
import { r, s, yazi, type Palet } from "../design/tokens";
import { tenteDeseni } from "./kepenk/tente-desen";
import { ZamanHapi } from "./kepenk/ZamanHapi";
import { sureMetni } from "./kepenk/olcum";
import { saatBulunma } from "./kepenk/tr-saat";
import { siparisKalanDakika, siparisPillDurumu } from "../lib/order-durum";
import { useOrderDetails } from "../hooks/use-order-details";
import { formatClockTime } from "../lib/format";
import { PanelMuhur } from "./panel/PanelMuhur";
import { PanelPill } from "./panel/PanelPill";
import type { ReservationItem } from "../lib/api-types";

const SATIR_YUKSEKLIGI = 88;
const SERIT_GENISLIGI = 4;

interface OrderRowProps {
  reservation: ReservationItem;
  onPress: () => void;
  onKepenkAc: () => void;
}

/**
 * A single Siparişler row — spec §4.6: a 4pt tente strip down the left
 * edge (the shop's hashed identity, same colour as the offer card and the
 * street), the shop name and package, and on the right either a live time
 * pill or the KURTARILDI mark. Active (CONFIRMED) rows carry a 44pt
 * "KEPENGİ AÇ" shortcut straight into redeem.
 *
 * Two independent Pressables, not one nested inside the other — the row
 * navigates to the ticket, the shortcut jumps straight to redeem, and a
 * screen reader needs to reach both as separate stops rather than one
 * swallowing the other.
 */
export function OrderRow({ reservation, onPress, onKepenkAc }: OrderRowProps) {
  const { t } = useTranslation();
  const palet = usePalet();
  const simdi = useSimdi();
  const azaltHareket = useReduceMotion();
  const { data } = useOrderDetails(reservation.id);
  const desen = tenteDeseni(reservation.storeId);

  const baslik = data?.storeName ?? t("orders.unknownStoreName");
  const altBaslik = data?.bagTitle ?? `${t("orders.code")}: ${reservation.code}`;
  const kepenkAcGoster = reservation.status === "CONFIRMED";

  const { durumMetni, pill } = sagTarafiOlustur(reservation, simdi, azaltHareket, palet, t);

  return (
    <View
      style={[
        styles.satir,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
      ]}
    >
      <View style={[styles.serit, { backgroundColor: desen.bir }]} />
      <View style={styles.govde}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${baslik}. ${altBaslik}. ${durumMetni}`}
          style={({ pressed }) => [styles.ustBolum, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.metinSutunu}>
            <Text
              style={[yazi.title, { color: palet.yaziAna }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {baslik}
            </Text>
            <Text
              style={[yazi.data, { color: palet.yaziSis }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {altBaslik}
            </Text>
          </View>
          <View
            style={styles.durumSutunu}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {pill}
          </View>
        </Pressable>

        {kepenkAcGoster ? (
          <Pressable
            onPress={onKepenkAc}
            accessibilityRole="button"
            accessibilityLabel={t("orders.kepenkAc")}
            style={({ pressed }) => [
              styles.kepenkAcButonu,
              { backgroundColor: palet.sodyumDolgu },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[yazi.body, styles.kepenkAcMetni, { color: palet.sodyumMurekkep }]}>
              {t("orders.kepenkAc")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function sagTarafiOlustur(
  reservation: ReservationItem,
  simdi: Date,
  azaltHareket: boolean | null,
  palet: Palet,
  t: TFunction,
): { durumMetni: string; pill: ReactNode } {
  if (reservation.status === "CONFIRMED") {
    const durum = siparisPillDurumu(simdi, reservation.pickupStartAt);
    const kalanDk = siparisKalanDakika(simdi, reservation.pickupEndAt);
    const acilisSaati = saatBulunma(formatClockTime(reservation.pickupStartAt));
    const durumMetni =
      durum === "acilmadi" ? t("vitrin.acilis", { saat: acilisSaati }) : sureIfadesi(kalanDk, t);
    return {
      durumMetni,
      pill: (
        <ZamanHapi
          durum={durum}
          kalanDk={kalanDk}
          acilisSaati={acilisSaati}
          palet={palet}
          azaltHareket={azaltHareket}
        />
      ),
    };
  }

  if (reservation.status === "REDEEMED") {
    return {
      durumMetni: t("orders.kurtarildiMuhru"),
      pill: <PanelMuhur label={t("orders.kurtarildiMuhru")} />,
    };
  }

  const etiket = t(`orders.status.${reservation.status}`);
  return { durumMetni: etiket, pill: <PanelPill label={etiket} /> };
}

function sureIfadesi(kalanDk: number, t: TFunction): string {
  const { saat, dakika } = sureMetni(kalanDk);
  if (saat === 0) return t("vitrin.sureDk", { dk: dakika });
  if (dakika === 0) return t("vitrin.sureSaatTam", { saat });
  return t("vitrin.sureSaat", { saat, dk: dakika });
}

const styles = StyleSheet.create({
  satir: {
    flexDirection: "row",
    borderRadius: r.card,
    overflow: "hidden",
    minHeight: SATIR_YUKSEKLIGI,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    elevation: 0,
  },
  serit: { width: SERIT_GENISLIGI },
  govde: { flex: 1 },
  ustBolum: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: s.s3,
    paddingTop: s.s3,
    paddingBottom: s.s2,
    gap: s.s2,
  },
  metinSutunu: { flex: 1, gap: 2 },
  durumSutunu: { alignItems: "flex-end" },
  kepenkAcButonu: {
    marginHorizontal: s.s3,
    marginBottom: s.s3,
    height: 44,
    borderRadius: r.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  kepenkAcMetni: { fontFamily: "Archivo_600SemiBold" },
});
