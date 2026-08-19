import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Kepenk } from "../kepenk/Kepenk";
import { Tente } from "../kepenk/Tente";
import { ZamanHapi } from "../kepenk/ZamanHapi";
import { glyphSec } from "../kepenk/glyphs";
import type { KepenkDurumu } from "../kepenk/olcum";
import { tabelaGenisligi } from "../kepenk/tabela-olcu";
import { tenteDeseni, tenteSonuk } from "../kepenk/tente-desen";
import { r, s, yazi, type Palet } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";

/**
 * The storefront at the top of the offer detail (spec §4.3).
 *
 * The same object as the list card, at the size a shop is when you have
 * stopped walking and are standing in front of it: an 8pt awning, a 128pt
 * kepenk band instead of 68, and the sign at `tabela.xl` in a 56pt
 * plaque. Everything below it — the sign, the price, the window — is
 * still architecturally out of the shutter's reach; the cap at 0.78 is
 * the same cap, and the band it is capped to is simply taller.
 */

const TENTE = 8;
export const DETAY_BANDI = 128;
const PLAKA = 56;

/** `tabela.xl` is 28pt and this plaque is wider than the card's, so most
 * names sit at full size; the ones that do not quieten rather than
 * truncate, exactly as on the card (see tabela-olcu.ts). */
const DETAY_EN_BUYUK = 28;
const DETAY_EN_KUCUK = 18;

export function detayTabelaBoyutu(ad: string, kullanilabilir: number): number {
  for (let boyut = DETAY_EN_BUYUK; boyut > DETAY_EN_KUCUK; boyut -= 1) {
    if (tabelaGenisligi(ad, boyut) <= kullanilabilir) return boyut;
  }
  return DETAY_EN_KUCUK;
}

export function DetayBasligi({
  genislik,
  dukkanId,
  dukkanAdi,
  kategori,
  p,
  guc,
  durum,
  kalanDk,
  acilisSaati,
  kalanAdet,
  meta,
  puan,
  palet,
  azaltHareket,
}: {
  genislik: number;
  dukkanId: string;
  dukkanAdi: string;
  kategori: string;
  p: number;
  guc: number;
  durum: KepenkDurumu;
  kalanDk: number;
  acilisSaati: string;
  kalanAdet: number;
  /** "Pastane · Yeldeğirmeni, Kadıköy" */
  meta: string;
  /** "★ 4,7 · 212", or null when nobody has rated the shop yet. */
  puan: string | null;
  palet: Palet;
  azaltHareket: boolean | null;
}) {
  const tukendi = durum === "tukendi";
  const desen = tenteDeseni(dukkanId);
  const yazit = trUpper(dukkanAdi);
  const icGenislik = genislik - 2 * s.s4 - 12 - 6 - 12;
  const boyut = detayTabelaBoyutu(yazit, icGenislik);

  return (
    <View
      style={[
        styles.cephe,
        {
          width: genislik,
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderWidth: palet.kartCizgiKalinlik,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
      ]}
    >
      <Tente
        genislik={genislik}
        yukseklik={TENTE}
        desen={tukendi ? tenteSonuk(desen, palet) : desen}
      />

      <Kepenk
        genislik={genislik}
        band={DETAY_BANDI}
        p={p}
        guc={guc}
        glyph={glyphSec(kategori, dukkanAdi)}
        palet={palet}
        azaltHareket={azaltHareket}
        kalanAdet={kalanAdet}
        hap={
          tukendi ? null : (
            <ZamanHapi
              durum={durum}
              kalanDk={kalanDk}
              acilisSaati={acilisSaati}
              palet={palet}
              azaltHareket={azaltHareket}
            />
          )
        }
      />

      {/* The shop's own light falling on the top of its own sign. */}
      {guc > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${palet.isikRgb},${(0.24 * guc * palet.isikSiddeti).toFixed(3)})`,
            `rgba(${palet.isikRgb},0)`,
          ]}
          style={[styles.altParlama, { top: TENTE + DETAY_BANDI, width: genislik }]}
        />
      ) : null}

      <View
        style={[styles.tabelaAlani, { height: PLAKA }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[
            styles.plaka,
            {
              backgroundColor: palet.plakaZemin,
              borderColor: palet.plakaCizgi,
            },
          ]}
        >
          <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
          <Text
            style={[
              yazi.tabelaXl,
              styles.ad,
              {
                fontSize: boyut,
                lineHeight: boyut + 4,
                color: tukendi ? palet.plakaYaziSonuk : palet.plakaYazi,
              },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={yazi.tabelaXl.maxFontSizeMultiplier}
          >
            {yazit}
          </Text>
          <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
        </View>
      </View>

      <View style={styles.meta}>
        <Text
          style={[yazi.data, styles.metaMetni, { color: palet.yaziSis }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {meta}
        </Text>
        {puan ? (
          <Text
            style={[yazi.data, { color: palet.sodyumYazi }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {puan}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cephe: { borderRadius: r.card, overflow: "hidden", elevation: 0 },
  altParlama: { position: "absolute", left: 0, height: 26 },
  tabelaAlani: { alignItems: "center", justifyContent: "center" },
  plaka: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: r.plaque,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    marginHorizontal: s.s4,
    flex: 1,
    alignSelf: "stretch",
    marginVertical: s.s2,
  },
  civata: { width: 3, height: 3, borderRadius: 1.5 },
  ad: { flex: 1, textAlign: "center", marginHorizontal: 6 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: s.s4,
    paddingBottom: s.s3,
    gap: s.s2,
  },
  metaMetni: { flexShrink: 1 },
});
