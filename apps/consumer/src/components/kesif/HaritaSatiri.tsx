import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { fiyatMetni, kalanDakika, sureMetni, teklifDurumu, tenteDeseni } from "../kepenk";

/**
 * HARİTA SATIRI — the map bottom sheet's compact row (spec §4.2, verbatim:
 * "the three nearest offers, sorted by closing time, as 72pt compact rows
 * (tente strip 4pt · name · price · time pill)"). Deliberately not a
 * shrunk `VitrinKarti` — the spec names exactly four elements for this
 * row and no gauge, so this reuses the tente hash and the Turkish
 * formatters without dragging in the shutter/light machinery three rows
 * inside a fixed 180pt sheet have no room for.
 *
 * Its one caller mounts it inside the map tab's bottom sheet, which paints
 * `yuzeyYukselti` — so this row is card type, not street type, even though
 * every other component in this folder is on the ground.
 */
export function HaritaSatiri({
  dukkanId,
  dukkanAdi,
  fiyatKurus,
  kalanAdet,
  alisBaslangic,
  alisBitis,
  simdi,
  secili = false,
  onPress,
}: {
  dukkanId: string;
  dukkanAdi: string;
  fiyatKurus: number;
  kalanAdet: number;
  alisBaslangic: string;
  alisBitis: string;
  simdi: Date;
  secili?: boolean;
  onPress: () => void;
}) {
  const palet = usePalet();
  const desen = tenteDeseni(dukkanId);
  const durum = teklifDurumu(kalanAdet, new Date(alisBaslangic), new Date(alisBitis), simdi);
  const kalanDk = kalanDakika(simdi, new Date(alisBitis));
  const { saat, dakika } = sureMetni(kalanDk);
  const sureEtiketi = durum === "tukendi" ? null : saat > 0 ? `${saat} sa` : `${dakika} dk`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dukkanAdi}, ${fiyatMetni(fiyatKurus)}`}
      accessibilityState={{ selected: secili }}
      style={({ pressed }) => [
        styles.satir,
        { backgroundColor: secili ? palet.yuzeyYukselti : "transparent" },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={[styles.tenteSerit, { backgroundColor: desen.bir }]} />
      <View style={styles.govde}>
        <Text
          style={[yazi.bodyStrong, { color: palet.yaziAna }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {trUpper(dukkanAdi)}
        </Text>
        <Text
          style={[yazi.priceLg, { color: palet.sodyumYazi }]}
          maxFontSizeMultiplier={1.3}
        >
          {fiyatMetni(fiyatKurus)}
        </Text>
      </View>
      {sureEtiketi ? (
        <View
          style={[styles.hap, { backgroundColor: palet.hapZemin, borderColor: palet.hapCizgi }]}
        >
          <Text style={[yazi.data, { color: palet.hapYazi }]} maxFontSizeMultiplier={1.3}>
            {sureEtiketi}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  satir: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: s.s3,
    borderRadius: r.card,
    gap: s.s3,
  },
  tenteSerit: { width: 4, height: 48, borderRadius: 2 },
  govde: { flex: 1, gap: 4 },
  hap: {
    minWidth: 52,
    height: 20,
    borderRadius: r.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s2,
  },
});
