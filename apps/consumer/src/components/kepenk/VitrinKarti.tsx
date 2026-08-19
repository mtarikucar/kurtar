import { PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useReduceMotion } from "../../design/reduce-motion";
import { useSimdi } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { kart, m, r, s, yazi, type Palet } from "../../design/tokens";
import { formatClockTime, formatPickupWindow } from "../../lib/format";
import { DegerCubugu } from "./DegerCubugu";
import { glyphSec } from "./glyphs";
import { kartOlculeri } from "./kart-olcu";
import { Kepenk } from "./Kepenk";
import { StokCipi } from "./StokCipi";
import { Tabela } from "./Tabela";
import { Tente } from "./Tente";
import { ZamanHapi } from "./ZamanHapi";
import {
  degerBandiMetni,
  degerOrani,
  fiyatMetni,
  isikGucu,
  kalanDakika,
  katMetni,
  kepenkP,
  mesafeMetni,
  sayi,
  sureMetni,
  teklifDurumu,
  yurumeDakikasi,
  YURUME_UST_SINIRI_M,
} from "./olcum";
import { tenteDeseni, tenteSonuk } from "./tente-desen";
import { saatBulunma } from "./tr-saat";

/**
 * VİTRİN KARTI — the offer card (spec §3).
 *
 * Fixed 358×196, radius 4, `overflow: hidden`, elevation 0, no rotation,
 * no separators. Depth is painted: a top hairline where light lands on the
 * edge, a bottom contact edge where the object meets the pavement, and the
 * light spill inside the vitrin. No shadow — iOS and Android are two
 * different physics engines and cannot be made to match (§1.3 / §5.1).
 */

export interface VitrinTeklifi {
  readonly teklifId: string;
  readonly dukkanId: string;
  readonly dukkanAdi: string;
  readonly paketAdi: string;
  /** The API's BagCategory. */
  readonly kategori: string;
  readonly fiyatKurus: number;
  readonly degerMinKurus: number;
  readonly degerMaxKurus: number;
  /** ISO instants. */
  readonly alisBaslangic: string;
  readonly alisBitis: string;
  readonly kalanAdet: number;
  readonly mesafeM: number;
}

export function VitrinKarti({
  teklif,
  onPress,
  genislik = kart.genislik,
  girisYap = true,
}: {
  teklif: VitrinTeklifi;
  onPress?: () => void;
  genislik?: number;
  girisYap?: boolean;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const simdi = useSimdi();
  const azaltHareket = useReduceMotion();

  // The gauge recomputes from `band`, so it stays honest at every text
  // size (spec §1.2 Dynamic type). The card's height is measured from the
  // pavement's own type rather than stepped to a constant, because a
  // constant is what let `overflow: 'hidden'` eat the meta rail — see
  // kart-olcu.ts.
  const {
    buyuk,
    band,
    tabela: tabelaYuksekligi,
    metaSatirSayisi,
    yukseklik: kartYuksekligi,
  } = kartOlculeri(PixelRatio.getFontScale());

  const baslangic = new Date(teklif.alisBaslangic);
  const bitis = new Date(teklif.alisBitis);
  const durum = teklifDurumu(teklif.kalanAdet, baslangic, bitis, simdi);
  const kalanDk = kalanDakika(simdi, bitis);
  const tukendi = durum === "tukendi";

  const p = kepenkP(kalanDk, durum);
  const guc = isikGucu(p, durum);
  const oran = degerOrani(teklif.degerMinKurus, teklif.degerMaxKurus, teklif.fiyatKurus);
  const desen = tenteDeseni(teklif.dukkanId);
  const acilisSaati = saatBulunma(formatClockTime(baslangic));
  const pencere = formatPickupWindow(teklif.alisBaslangic, teklif.alisBitis);
  const yurumeDk = yurumeDakikasi(teklif.mesafeM);

  const metaParcalari = [
    pencere,
    mesafeMetni(teklif.mesafeM),
    teklif.mesafeM <= YURUME_UST_SINIRI_M ? t("vitrin.kalanDk", { dk: yurumeDk }) : null,
  ].filter((parca): parca is string => parca !== null);

  const metaMetni = tukendi
    ? t("vitrin.yarinAcilis", { saat: acilisSaati })
    : buyuk
      ? // At the large step the rail is two lines, so it has to be told
        // WHERE to break. Left to plain spaces it split "1,3 km" across
        // the turn and opened the second line with a bare "·". Binding
        // every space inside a segment, and every separator to the
        // segment before it, leaves exactly one kind of break
        // opportunity: between segments — a number never leaves its unit
        // and no line starts on punctuation.
        metaParcalari.map(bagla).join("\u00A0· ")
      : metaParcalari.join(" · ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={erisimEtiketi(t, teklif, {
        durum,
        kalanDk,
        oran,
        pencere,
        acilisSaati,
        yurumeDk,
      })}
      style={({ pressed }) => [
        styles.kart,
        {
          width: genislik,
          height: kartYuksekligi,
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
        pressed ? { opacity: m.pressOpacity } : null,
      ]}
    >
      <Tente
        genislik={genislik - 2}
        desen={tukendi ? tenteSonuk(desen, palet) : desen}
      />

      <Kepenk
        genislik={genislik - 2}
        band={band}
        p={p}
        guc={guc}
        glyph={glyphSec(teklif.kategori, teklif.dukkanAdi)}
        palet={palet}
        azaltHareket={azaltHareket}
        kalanAdet={teklif.kalanAdet}
        girisYap={girisYap}
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

      {/* The shop's light washes the top of its own sign — the card body
          below the opening is lit by the opening, which is what makes the
          whole object read as one lit thing rather than a bright strip
          pasted onto a dark card. */}
      {guc > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${palet.isikRgb},${(0.22 * guc * palet.isikSiddeti).toFixed(3)})`,
            `rgba(${palet.isikRgb},0)`,
          ]}
          style={[styles.altParlama, { top: kart.tente + band, width: genislik - 2 }]}
        />
      ) : null}

      <Tabela
        genislik={genislik - 2}
        yukseklik={tabelaYuksekligi}
        ad={teklif.dukkanAdi}
        palet={palet}
        sonuk={tukendi}
      />

      <View
        style={[styles.kaldirim, tukendi ? styles.sonuk : null]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={[yazi.paket, { color: palet.yaziAna }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {teklif.paketAdi}
        </Text>

        <View style={[styles.fiyatSatiri, buyuk ? styles.fiyatSatiriDik : null]}>
          <View style={styles.fiyatGrubu}>
            <Text
              style={[yazi.priceLg, { color: palet.sodyumYazi }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {fiyatMetni(teklif.fiyatKurus)}
            </Text>
            <Text
              style={[yazi.micro, styles.kat, { color: palet.sodyumYazi }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {t("vitrin.kat", { kat: katMetni(oran) })}
            </Text>
          </View>
          <Text
            style={[yazi.data, styles.bant, { color: palet.yaziSis }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {t("vitrin.degerBandi", {
              band: degerBandiMetni(teklif.degerMinKurus, teklif.degerMaxKurus),
            })}
          </Text>
        </View>

        <DegerCubugu oran={oran} palet={palet} etiket={false} />

        <View style={[styles.metaSatiri, buyuk ? styles.metaSatiriBuyuk : null]}>
          <Text
            style={[yazi.data, styles.meta, { color: palet.yaziSis }]}
            numberOfLines={metaSatirSayisi}
            maxFontSizeMultiplier={1.3}
          >
            {metaMetni}
          </Text>
          {tukendi ? null : (
            <StokCipi
              adet={teklif.kalanAdet}
              palet={palet}
              azaltHareket={azaltHareket}
            />
          )}
        </View>
      </View>

      {tukendi ? <TukendiStickeri palet={palet} etiket={t("vitrin.tukendi")} /> : null}
    </Pressable>
  );
}

/** Every space inside one meta segment becomes a no-break space: "1,3 km"
 * and "16 dk" are single facts, not two words each. */
function bagla(parca: string): string {
  return parca.replace(/ /g, "\u00A0");
}

/**
 * The one composed label the card exposes. Everything decorative — tente,
 * kepenk, glyph, bar, plaque, chip — is hidden from the screen reader, so
 * a swipe lands on one 196pt target that says the whole offer (spec §3).
 */
function erisimEtiketi(
  t: (anahtar: string, secenekler?: Record<string, unknown>) => string,
  teklif: VitrinTeklifi,
  durumBilgisi: {
    durum: ReturnType<typeof teklifDurumu>;
    kalanDk: number;
    oran: number;
    pencere: string;
    acilisSaati: string;
    yurumeDk: number;
  },
): string {
  const { durum, kalanDk, oran, pencere, acilisSaati, yurumeDk } = durumBilgisi;
  const ortak = {
    dukkan: teklif.dukkanAdi,
    paket: teklif.paketAdi,
    fiyat: sayi(teklif.fiyatKurus / 100, 2),
    degerMin: sayi(Math.round(teklif.degerMinKurus / 100)),
    degerMax: sayi(Math.round(teklif.degerMaxKurus / 100)),
    kat: katMetni(oran).replace("×", ""),
    adet: teklif.kalanAdet,
    pencere,
    mesafe: mesafeMetni(teklif.mesafeM),
    yurume: yurumeDk,
  };

  if (durum === "tukendi") {
    return t("vitrin.erisimTukendi", { ...ortak, acilis: acilisSaati });
  }
  if (durum === "acilmadi") {
    return t("vitrin.erisimAcilmadi", { ...ortak, acilis: acilisSaati });
  }
  const { saat, dakika } = sureMetni(kalanDk);
  const kalan =
    saat === 0
      ? t("vitrin.sureDk", { dk: dakika })
      : dakika === 0
        ? t("vitrin.sureSaatTam", { saat })
        : t("vitrin.sureSaat", { saat, dk: dakika });
  return t("vitrin.erisim", { ...ortak, kalan });
}

/** A torn paper sticker taped across the closed metal — the only rotated
 * element on the card, and the only place the app rotates anything
 * outside the error state (§3, §5.14). */
function TukendiStickeri({ palet, etiket }: { palet: Palet; etiket: string }) {
  const g = 132;
  const y = 30;
  return (
    <View style={styles.sticker} pointerEvents="none">
      <Svg width={g} height={y} style={[styles.tamKaplama]}>
        <Path d={yirtikYol(g, y)} fill={palet.tenteDolgu} />
      </Svg>
      <Text
        style={[yazi.sticker, { color: palet.tenteMurekkep }]}
        numberOfLines={1}
        maxFontSizeMultiplier={yazi.sticker.maxFontSizeMultiplier}
      >
        {etiket}
      </Text>
    </View>
  );
}

/** Straight taped edges top and bottom, torn ends left and right. */
export function yirtikYol(genislik: number, yukseklik: number): string {
  const dis = 3;
  const adim = yukseklik / 4;
  const sag = genislik - dis;
  const yol = [
    `M${dis} 0`,
    `H${sag}`,
    `L${genislik} ${adim}`,
    `L${sag} ${adim * 2}`,
    `L${genislik} ${adim * 3}`,
    `L${sag} ${yukseklik}`,
    `H${dis}`,
    `L0 ${adim * 3}`,
    `L${dis} ${adim * 2}`,
    `L0 ${adim}`,
    "Z",
  ];
  return yol.join(" ");
}

const styles = StyleSheet.create({
  tamKaplama: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  altParlama: { position: "absolute", left: 0, height: 22 },
  kart: {
    borderRadius: r.card,
    overflow: "hidden",
    borderWidth: 1,
    // elevation 0 everywhere: depth is painted, never cast (§1.3).
    elevation: 0,
  },
  /**
   * The pavement block, on §3's rhythm: paket 20 · price 28 · bar 4 ·
   * meta 18, with the 4/2/4 gaps the zone map spends between them. It
   * fills the 80pt left under the tabela exactly at the default text
   * size (78 after its own bottom padding), and `space-between` re-spends
   * the slack. Past that the CARD
   * grows to whatever this block needs (kart-olcu.ts) — `space-between`
   * in a box too small silently behaves like flex-start and hands the
   * overflow to `overflow: 'hidden'`, which is how the meta rail
   * disappeared instead of complaining.
   */
  kaldirim: {
    flex: 1,
    paddingHorizontal: s.s3,
    paddingBottom: 2,
    justifyContent: "space-between",
  },
  fiyatSatiri: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  // At 1.3× the row stacks rather than squeezing the band text to nothing.
  fiyatSatiriDik: { flexDirection: "column", alignItems: "flex-start" },
  fiyatGrubu: { flexDirection: "row", alignItems: "baseline" },
  kat: { marginLeft: s.s2 },
  bant: { flexShrink: 1, textAlign: "right", marginLeft: s.s2 },
  metaSatiri: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // At 1.3× the rail wraps to two lines; the chip stays pinned to the
  // first one, beside the pickup window, rather than floating in the
  // middle of a two-line block.
  metaSatiriBuyuk: { alignItems: "flex-start" },
  meta: { flexShrink: 1, marginRight: s.s2 },
  sonuk: { opacity: 0.45 },
  sticker: {
    position: "absolute",
    left: 24,
    top: 30,
    width: 132,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-4deg" }],
  },
});
