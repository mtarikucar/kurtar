import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { tabelaGenisligi } from "../kepenk/tabela-olcu";
import { kis } from "../kepenk/olcum";
import { r, s, yazi, type Palet } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";

/**
 * The shop's sign, and the difference between a shut shop and an open
 * one — the one object shared by the app's two upward rolls (§4.4, §4.5).
 *
 * This is the element a shop worker reads FIRST — "is this us?" — so on
 * these two screens it is set as large as the plaque will take it rather
 * than at the card's `tabela.lg`, and lighting it is a painted sodium
 * bloom rather than a colour swap: a sign does not change colour when the
 * shop opens, a lamp comes on behind it. The plaque keeps the two
 * mounting bolts every real Turkish sign has.
 *
 * Real RN `<Text>` over the plaque — never SVG `<Text>`, which Android
 * resolves through its own Typeface lookup and silently drops the Turkish
 * diacritics with it (§5.5).
 */

const HERO_EN_BUYUK = 44;
const HERO_EN_KUCUK = 22;

/** The plaque's own padding, its bolts and the gaps around the type —
 * everything the name does NOT get to use. */
const PLAKA_ICI = 2 * 6 + 6 + 12;

/** The sign may grow this far with the user's text size and no further —
 * the same multiplier RN itself applies to the style, so the fit and the
 * drawing agree on one number. */
const HERO_OLCEK_TAVANI = yazi.tabelaXl.maxFontSizeMultiplier;

export interface HeroTabelaOlcusu {
  /** The `fontSize` for the style. RN multiplies it by the user's capped
   * text scale, which is how it becomes `cizilenBoyut`. */
  readonly boyut: number;
  /** Absolute, never a multiplier — at multiplied leading Android clips
   * ğ/ş/ç and the İ dot (§1.2). In style units, like `boyut`. */
  readonly satirYuksekligi: number;
  /** What the reader actually sees, in points on glass. The 22pt floor
   * and the 44pt ceiling are about THIS number. */
  readonly cizilenBoyut: number;
}

/**
 * The largest whole DRAWN point size at which the name fits its plaque,
 * measured with Archivo Black's OWN advance widths (see tabela-olcu.ts).
 * The name wins and the type gives way, which is what a signwriter would
 * do.
 *
 * The fit used to be computed at 1x while the text was then allowed to
 * draw at up to 1.4x. Two lines hid it — the name wrapped instead of
 * truncating — but a budget measured at one scale and spent at another is
 * not a budget, and the second line is a fallback, not a plan: it costs
 * the plaque's whole vertical room and it breaks a shop's name in the
 * middle. Stating both the ceiling and the floor in drawn points is what
 * makes the sign quieten only for the names that need it.
 *
 * `olcek` is `PixelRatio.getFontScale()`. At 1x this is byte-for-byte the
 * old behaviour.
 */
export function heroTabelaOlcusu(
  yazit: string,
  kullanilabilir: number,
  olcek = 1,
): HeroTabelaOlcusu {
  const carpan = kis(olcek, 1, HERO_OLCEK_TAVANI);
  const tavan = HERO_EN_BUYUK * carpan;
  let cizilenBoyut = HERO_EN_KUCUK;
  for (let boyut = Math.floor(tavan); boyut > HERO_EN_KUCUK; boyut -= 1) {
    if (tabelaGenisligi(yazit, boyut) <= kullanilabilir) {
      cizilenBoyut = boyut;
      break;
    }
  }
  return {
    boyut: cizilenBoyut / carpan,
    satirYuksekligi: (cizilenBoyut + 6) / carpan,
    cizilenBoyut,
  };
}

export function HeroTabela({
  ad,
  palet,
  yanik,
  genislik,
  testIDOneki = "kepenk",
}: {
  ad: string;
  palet: Palet;
  /** Whether the lamp behind the sign is on. */
  yanik: boolean;
  genislik: number;
  testIDOneki?: string;
}) {
  const yazit = trUpper(ad);
  const olcu = heroTabelaOlcusu(yazit, genislik - PLAKA_ICI, PixelRatio.getFontScale());

  return (
    <View style={styles.alan}>
      {/* The bloom the lamp throws around the sign. It falls off on BOTH
          sides of the plaque: a bloom with a hard edge is a rectangle
          rather than a light, and against a lit interior that edge shows
          as a seam across the whole frame. Ends at alpha 0, never
          `'transparent'` (§5.7). */}
      {yanik ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${palet.isikRgb},0)`,
            `rgba(${palet.isikRgb},0.26)`,
            `rgba(${palet.isikRgb},0.18)`,
            `rgba(${palet.isikRgb},0)`,
          ]}
          locations={[0, 0.3, 0.66, 1]}
          style={[styles.hale, { width: genislik + 40 }]}
        />
      ) : null}
      <View
        style={[
          styles.plaka,
          {
            width: genislik,
            backgroundColor: palet.plakaZemin,
            borderColor: yanik ? palet.sodyumDolgu : palet.plakaCizgi,
          },
        ]}
        testID={yanik ? `${testIDOneki}-tabela-yanik` : `${testIDOneki}-tabela-sonuk`}
      >
        {/* Light landing ON the painted sign. */}
        {yanik ? (
          <LinearGradient
            pointerEvents="none"
            colors={[`rgba(${palet.isikRgb},0.34)`, `rgba(${palet.isikRgb},0.06)`]}
            style={styles.plakaIsigi}
          />
        ) : null}
        <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
        <Text
          style={[
            yazi.tabelaXl,
            styles.yazit,
            {
              fontSize: olcu.boyut,
              lineHeight: olcu.satirYuksekligi,
              color: yanik ? palet.plakaYazi : palet.plakaYaziSonuk,
            },
          ]}
          numberOfLines={2}
          maxFontSizeMultiplier={yazi.tabelaXl.maxFontSizeMultiplier}
        >
          {yazit}
        </Text>
        <View style={[styles.civata, { backgroundColor: palet.plakaBoltu }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alan: { alignItems: "center", alignSelf: "center" },
  hale: { position: "absolute", top: -30, bottom: -30, borderRadius: r.card },
  plakaIsigi: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: r.plaque,
  },
  plaka: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: r.plaque,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: s.s3,
    overflow: "hidden",
  },
  civata: { width: 3, height: 3, borderRadius: 1.5 },
  yazit: { flex: 1, textAlign: "center", marginHorizontal: 6 },
});
