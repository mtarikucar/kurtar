import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Kepenk } from "../kepenk/Kepenk";
import { Tente } from "../kepenk/Tente";
import { ZamanHapi } from "../kepenk/ZamanHapi";
import { glyphSec } from "../kepenk/glyphs";
import type { KepenkDurumu } from "../kepenk/olcum";
import { kis } from "../kepenk/olcum";
import { TABELA_ARALIK, tabelaGenisligi } from "../kepenk/tabela-olcu";
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
 * truncate, exactly as on the card (see tabela-olcu.ts). Both numbers are
 * DRAWN points — what the reader has on glass — not style units. */
const DETAY_EN_BUYUK = 28;
const DETAY_EN_KUCUK = 18;

/** `tabela.xl`'s own dynamic-type ceiling (§1.2: "1.4 on the tabela"),
 * which is also the multiplier RN itself will apply — so the fit and the
 * drawing agree instead of disagreeing by 40%. */
const DETAY_OLCEK_TAVANI = 1.4;

/** The single line the name is drawn on, in drawn points: the 56pt band,
 * less the plaque's 8pt of vertical margin and 1.5pt border on each side.
 * Unlike the card's sign this plaque CANNOT grow — it is a fixed object on
 * §4.3's fixed Y — so this box, not the 28pt ceiling, is what binds first
 * for a short name at a raised text size. */
const DETAY_SATIR_KUTUSU = PLAKA - 2 * s.s2 - 2 * 1.5;
/** The leading the sign carries over its own size. Absolute, never a
 * multiplier — Android clips ğ/ş/ç and the İ dot at multiplied leading. */
const DETAY_SATIR_FAZLASI = 4;

export interface DetayTabelaOlcusu {
  /** The `fontSize` to put in the style. RN multiplies it by the user's
   * (capped) text scale, which is exactly how it becomes `cizilenBoyut`. */
  readonly boyut: number;
  /** In style units, like `boyut`. */
  readonly satirYuksekligi: number;
  /** What the reader actually sees, in points on glass. */
  readonly cizilenBoyut: number;
}

/**
 * The largest whole DRAWN point size at which the name fits the plaque —
 * across it AND down it — between an 18pt floor and 28pt × the user's
 * text scale.
 *
 * `olcek` is `PixelRatio.getFontScale()`. At 1× this is byte-for-byte the
 * reviewed sign; below 1× the fit is still done at 1× and RN draws it
 * smaller, which can only ever fit. Fitting at 1× and letting the `<Text>`
 * paint at 1.4× is how "YELDEĞİRMENİ PASTANESİ" came back as "YELDEĞİRMENİ
 * PA…" on a page whose entire job is to say which shop you are standing in
 * front of — and this plaque is `numberOfLines={1}`, so the overflow does
 * not wrap, it is simply gone.
 */
export function detayTabelaBoyutu(
  ad: string,
  kullanilabilir: number,
  olcek = 1,
): DetayTabelaOlcusu {
  const carpan = kis(olcek, 1, DETAY_OLCEK_TAVANI);
  const tavan = Math.min(
    DETAY_EN_BUYUK * carpan,
    DETAY_SATIR_KUTUSU - DETAY_SATIR_FAZLASI,
  );
  const birimGenislik = tabelaGenisligi(ad, 1000) / 1000; // pt per pt of size
  const aralik = Math.max(ad.length - 1, 0) * TABELA_ARALIK;
  const ham = birimGenislik > 0 ? (kullanilabilir - aralik) / birimGenislik : tavan;
  const cizilenBoyut = kis(Math.floor(ham), DETAY_EN_KUCUK, tavan);
  return {
    boyut: cizilenBoyut / carpan,
    satirYuksekligi: (cizilenBoyut + DETAY_SATIR_FAZLASI) / carpan,
    cizilenBoyut,
  };
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
  const olcu = detayTabelaBoyutu(yazit, icGenislik, PixelRatio.getFontScale());

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
                fontSize: olcu.boyut,
                lineHeight: olcu.satirYuksekligi,
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
