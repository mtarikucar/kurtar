import { PixelRatio, StyleSheet, View } from "react-native";
import { Kepenk, Tabela, Tente } from "../kepenk";
import { usePalet } from "../../design/theme";
import { kart, r } from "../../design/tokens";

/**
 * KAPALI KART — the loading placeholder (spec §4.8).
 *
 * "No skeleton shimmer, ever. The loading state is a list of cards with
 * fully closed shutters and dark tabelas — literally the street before
 * opening." This is exactly that frame, built from the SAME Phase 1
 * pieces the real card uses (`Tente`, `Kepenk`, `Tabela`) rather than a
 * fake grey-bar skeleton: a fully-closed shutter (`p={1}`), no light
 * (`guc={0}` — the shop is shut and dark, same rule §3's `isikGucu()`
 * already enforces for "not open yet"/"sold out"), and a blank unlit
 * plaque (no name has streamed in yet).
 *
 * When the real offer arrives, the screen swaps this for a `<VitrinKarti
 * girisYap>` at the same position — its shutter starts from this exact
 * closed frame and rolls to the offer's true height (spec: "as each
 * shop's data arrives, its shutter rolls to its true height"). This
 * component owns no timer and no animation of its own; it is a single
 * static frame.
 */
export function KapaliKart({ genislik = kart.genislik }: { genislik?: number }) {
  const palet = usePalet();
  const buyuk = PixelRatio.getFontScale() >= kart.buyumeEsigi;
  const band = buyuk ? kart.bandBuyuk : kart.band;
  const tabelaYuksekligi = buyuk ? kart.tabelaBuyuk : kart.tabela;
  const kartYuksekligi = buyuk ? kart.yukseklikBuyuk : kart.yukseklik;

  return (
    <View
      style={[
        styles.kart,
        {
          width: genislik,
          height: kartYuksekligi,
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Tente
        genislik={genislik - 2}
        desen={{ ad: "kapali", bir: palet.metalKoyu, iki: palet.metalCinko }}
      />
      <Kepenk
        genislik={genislik - 2}
        band={band}
        p={1}
        guc={0}
        glyph="kafe"
        palet={palet}
        azaltHareket
        girisYap={false}
      />
      <Tabela genislik={genislik - 2} yukseklik={tabelaYuksekligi} ad="" palet={palet} sonuk />
      <View style={styles.kaldirim} />
    </View>
  );
}

const styles = StyleSheet.create({
  kart: {
    borderRadius: r.card,
    overflow: "hidden",
    borderWidth: 1,
    elevation: 0,
  },
  kaldirim: { flex: 1 },
});
