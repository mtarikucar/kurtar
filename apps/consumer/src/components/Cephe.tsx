import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Kepenk } from "./kepenk/Kepenk";
import { Tente } from "./kepenk/Tente";
import { isikGucu } from "./kepenk/olcum";
import { tenteDeseni, type TenteDeseni } from "./kepenk/tente-desen";
import { HeroTabela } from "./teslim/HeroTabela";
import { useReduceMotion } from "../design/reduce-motion";
import { usePalet } from "../design/theme";
import { r, s } from "../design/tokens";

const TENTE_YUKSEKLIGI = 8;
const BAND = 92;
/**
 * A shutter at rest: the shop is open, the evening has run a while, and
 * the lamp is on. It is deliberately NOT animated. Shutters go UP in
 * exactly two places in this app — purchase confirmation and the redeem
 * swipe — and that inversion is the whole emotional arc (§2); spending it
 * on a login screen would spend it before the user has done anything.
 */
const DURUS = 0.42;

/**
 * A shopfront at the size of one you have stopped in front of: the
 * awning, the sign with its mounting bolts, and — where a shutter means
 * something — the corrugated steel and the light under it.
 *
 * It measures ITSELF. Both surfaces that use it sit inside a scroll view
 * whose width is not known on the first paint of a cold web load, and
 * `useWindowDimensions()` reports 0 there: the SVG children were handed a
 * negative width, RNSVG rejected the attribute, and the frame came back
 * with the awning and the corrugation simply missing. `onLayout` asks the
 * question the layout can actually answer, and nothing draws until it
 * has.
 */
export function Cephe({
  dukkanId,
  desen,
  ad,
  yanik,
  kepenkli = true,
  testIDOneki,
}: {
  /** The shop whose awning this is; hashed to one of the six real
   * combinations, so it matches the card, the map pin and the order row. */
  dukkanId?: string;
  /** …or the pattern outright, for kurtar's own shopfront. */
  desen?: TenteDeseni;
  ad: string;
  /** Is the lamp behind the sign on? */
  yanik: boolean;
  /** A shutter is a clock for ONE offer's closing time (§2), so a surface
   * that is about a shop rather than an offer sets this false and shows
   * the sign alone. */
  kepenkli?: boolean;
  testIDOneki: string;
}) {
  const palet = usePalet();
  const azaltHareket = useReduceMotion();
  const [genislik, setGenislik] = useState(0);
  const guc = yanik ? isikGucu(DURUS, "acik") : 0;
  const tente = desen ?? tenteDeseni(dukkanId ?? ad);

  const olcum = (olay: LayoutChangeEvent) => {
    const yeni = Math.round(olay.nativeEvent.layout.width);
    if (yeni > 0 && yeni !== genislik) setGenislik(yeni);
  };

  return (
    <View
      onLayout={olcum}
      /**
       * The shopfront is the ONLY place either of its two screens prints
       * the name — the shop page draws no other title, and the sign-in
       * screen none at all. Hiding the whole thing from the accessibility
       * tree (which is what this used to do) therefore took away the one
       * thing a shop page must always say: which shop it is.
       *
       * `accessible` collapses the awning, the corrugated steel, the
       * light and the plaque into a single element — they are all one
       * picture of one shopfront, and a reader has no use for them one at
       * a time — and the explicit label is the name in its raw form, not
       * the sign's `trUpper()`'d lettering, so a screen reader pronounces
       * it rather than spelling it.
       */
      accessible
      accessibilityRole="header"
      accessibilityLabel={ad}
      style={[
        styles.cephe,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderWidth: palet.kartCizgiKalinlik,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
      ]}
    >
      {genislik > 0 ? (
        <>
          <Tente genislik={genislik} yukseklik={TENTE_YUKSEKLIGI} desen={tente} />

          {kepenkli ? (
            <>
              <Kepenk
                genislik={genislik}
                band={BAND}
                p={DURUS}
                guc={guc}
                glyph="firin"
                palet={palet}
                azaltHareket={azaltHareket}
                girisYap={false}
              />
              {/* The shop's own light falling on the top of its own sign,
                  ending at alpha 0 rather than at `'transparent'` (§5.7). */}
              {guc > 0 ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    `rgba(${palet.isikRgb},${(0.24 * guc * palet.isikSiddeti).toFixed(3)})`,
                    `rgba(${palet.isikRgb},0)`,
                  ]}
                  style={[
                    styles.altParlama,
                    { top: TENTE_YUKSEKLIGI + BAND, width: genislik },
                  ]}
                />
              ) : null}
            </>
          ) : null}

          <View style={styles.tabelaAlani}>
            <HeroTabela
              ad={ad}
              palet={palet}
              yanik={yanik}
              genislik={genislik - 2 * s.s4}
              testIDOneki={testIDOneki}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cephe: {
    alignSelf: "stretch",
    borderRadius: r.card,
    overflow: "hidden",
    minHeight: TENTE_YUKSEKLIGI + BAND,
    elevation: 0,
  },
  altParlama: { position: "absolute", left: 0, height: 26 },
  tabelaAlani: { paddingVertical: s.s4 },
});
