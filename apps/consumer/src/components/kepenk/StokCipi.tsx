import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { YERLI_SURUCU } from "../../design/motion";
import { m, r, s, yazi, type Palet } from "../../design/tokens";
import { STOK_ALARM_SINIRI, STOK_NOKTA_SINIRI } from "./olcum";

/**
 * STOK ÇİPİ — stock as light, bounded (spec §3).
 *
 * Above four remaining it is a hairline pill with a number. At four or
 * fewer, N lit squares appear before the number, because four is the
 * subitizing limit and a dot row past it is a serial count at 9pt in bad
 * light. At two or fewer the pill flips to awning red, and the last
 * square breathes: one light on in a nearly-closed shop is a picture of
 * scarcity that is also the fact of scarcity.
 */
export function StokCipi({
  adet,
  palet,
  azaltHareket,
}: {
  adet: number;
  palet: Palet;
  azaltHareket: boolean | null;
}) {
  const { t } = useTranslation();
  const alarm = adet <= STOK_ALARM_SINIRI;
  const noktaVar = adet <= STOK_NOKTA_SINIRI;
  const nefes = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!alarm || azaltHareket !== false) {
      nefes.setValue(1);
      return;
    }
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(nefes, {
          toValue: 0.55,
          duration: m.stokNefes / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
        Animated.timing(nefes, {
          toValue: 1,
          duration: m.stokNefes / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: YERLI_SURUCU,
        }),
      ]),
    );
    dongu.start();
    return () => dongu.stop();
  }, [alarm, azaltHareket, nefes]);

  const kareRengi = alarm ? palet.tenteMurekkep : palet.stokIsik;

  return (
    <View
      style={[
        styles.cip,
        alarm
          ? { backgroundColor: palet.tenteDolgu, borderColor: palet.tenteDolgu }
          : { borderColor: palet.cizgiKil },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {noktaVar
        ? Array.from({ length: Math.max(adet, 0) }, (_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.kare,
                { backgroundColor: kareRengi },
                alarm && i === adet - 1 ? { opacity: nefes } : null,
              ]}
            />
          ))
        : null}
      <Text
        style={[
          alarm ? yazi.cipAlarm : yazi.data,
          { color: alarm ? palet.tenteMurekkep : palet.yaziSis },
        ]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {alarm ? t("vitrin.stokAlarm", { adet }) : t("vitrin.stok", { adet })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cip: {
    flexDirection: "row",
    alignItems: "center",
    height: 18,
    borderRadius: r.pill,
    borderWidth: 1,
    paddingHorizontal: s.s2,
    gap: 3,
  },
  kare: { width: 8, height: 8, borderRadius: 2 },
});
