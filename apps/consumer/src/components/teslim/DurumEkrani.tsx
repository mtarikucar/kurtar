import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { Defs, Pattern } from "../kepenk/svg-cocuklu";
import { useSvgKimlik } from "../kepenk/svg-kimlik";
import { yirtikYol } from "../kepenk/VitrinKarti";
import { usePalet } from "../../design/theme";
import { r, s, yazi, type Palet } from "../../design/tokens";
import { Dugme } from "./ortak";

/**
 * Loading, error and the two "not now" states, in the metaphor (spec
 * §4.8).
 *
 * No skeleton shimmer, ever: masked-view + animated gradient is the most
 * reliably janky component in React Native and always looks cheap. The
 * loading state here is a shutter that is simply DOWN — the truest frame
 * of the metaphor, and a street before opening rather than a lie about
 * layout.
 *
 * The error state is a half-lowered shutter with a paper note taped
 * across it at 2°. That note is the only rotated element outside the
 * offer card's TÜKENDİ sticker, and it carries no text inside the rotated
 * SVG group — the words are real RN `<Text>` over it, because Android
 * resolves SVG type through its own Typeface lookup and would drop the
 * Turkish diacritics (§5.5).
 */
export type DurumTuru = "yukleniyor" | "hata" | "kapali";

export function DurumEkrani({
  tur,
  baslik,
  govde,
  eylemEtiketi,
  onEylem,
  ikinciEtiket,
  onIkinci,
  testID,
}: {
  tur: DurumTuru;
  baslik: string;
  govde?: string;
  eylemEtiketi?: string;
  onEylem?: () => void;
  ikinciEtiket?: string;
  onIkinci?: () => void;
  testID?: string;
}) {
  const palet = usePalet();

  return (
    <SafeAreaView
      style={[styles.kok, { backgroundColor: palet.bgAsfalt }]}
      edges={["top", "bottom", "left", "right"]}
      testID={testID}
    >
      <View style={styles.orta}>
        <KapaliCephe tur={tur} palet={palet} baslik={baslik} />
        {govde ? (
          <Text
            style={[yazi.body, styles.govde, { color: palet.yaziSis }]}
            maxFontSizeMultiplier={1.5}
          >
            {govde}
          </Text>
        ) : null}
        {eylemEtiketi && onEylem ? (
          <View style={styles.eylem}>
            <Dugme etiket={eylemEtiketi} onPress={onEylem} palet={palet} testID="durum-eylem" />
          </View>
        ) : null}
        {ikinciEtiket && onIkinci ? (
          <View style={styles.eylem}>
            <Dugme
              etiket={ikinciEtiket}
              onPress={onIkinci}
              palet={palet}
              ikincil
              testID="durum-ikinci"
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/** Paper is an object, not a semantic slot, so it keeps its own colour in
 * every phase — a note taped to a shutter is ivory with dark ink at noon
 * and at midnight alike. Taking `plakaYazi` here inverted it in daylight
 * (dark paper, pale ink), which is a plaque, not a note. */
const KAGIT = "#F2E6CE";
const KAGIT_MUREKKEBI = "#12181F";

const CEPHE_G = 240;
const CEPHE_Y = 150;

function KapaliCephe({
  tur,
  palet,
  baslik,
}: {
  tur: DurumTuru;
  palet: Palet;
  baslik: string;
}) {
  const kimlik = useSvgKimlik("durum-oluk");
  // Loading and "closed" are a shutter all the way down; an error is a
  // shutter halfway, because the shop is not shut — the line to it is.
  const kepenkY = tur === "hata" ? CEPHE_Y * 0.62 : CEPHE_Y;

  return (
    <View style={styles.cephe} accessibilityLabel={baslik} accessibilityRole="text">
      <View style={[styles.kutu, { backgroundColor: palet.vitrinZemin }]}>
        <Svg width={CEPHE_G} height={CEPHE_Y}>
          <Defs>
            <Pattern
              id={kimlik}
              x={0}
              y={0}
              width={8}
              height={1}
              patternUnits="userSpaceOnUse"
            >
              <Rect x={0} y={0} width={4} height={1} fill={palet.metalAcik} />
              <Rect x={4} y={0} width={4} height={1} fill={palet.metalKoyu} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={CEPHE_G} height={kepenkY} fill={`url(#${kimlik})`} />
          <Line
            x1={Math.round(CEPHE_G * 0.3)}
            y1={0}
            x2={Math.round(CEPHE_G * 0.3)}
            y2={kepenkY}
            stroke={palet.kepenkDikey}
            strokeWidth={1}
          />
          <Rect x={0} y={kepenkY - 4} width={CEPHE_G} height={1} fill={palet.kepenkDudakIsik} />
          <Rect x={0} y={kepenkY - 3} width={CEPHE_G} height={3} fill={palet.metalDudak} />
        </Svg>
      </View>

      {tur === "hata" ? (
        <View style={styles.not} pointerEvents="none">
          <Svg width={168} height={44} style={[styles.tamKaplama]}>
            <Path d={yirtikYol(168, 44)} fill={KAGIT} />
          </Svg>
          <Text
            style={[yazi.data, styles.notYazisi, { color: KAGIT_MUREKKEBI }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.2}
          >
            {baslik}
          </Text>
        </View>
      ) : (
        <Text
          style={[yazi.title, styles.baslik, { color: palet.yaziAna }]}
          maxFontSizeMultiplier={1.5}
        >
          {baslik}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  orta: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s6,
    gap: s.s4,
  },
  cephe: { alignItems: "center", gap: s.s4 },
  kutu: {
    width: CEPHE_G,
    height: CEPHE_Y,
    borderRadius: r.card,
    overflow: "hidden",
  },
  tamKaplama: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  not: {
    position: "absolute",
    top: CEPHE_Y * 0.36,
    width: 168,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s3,
    transform: [{ rotate: "-2deg" }],
  },
  notYazisi: { textAlign: "center" },
  baslik: { textAlign: "center" },
  govde: { textAlign: "center" },
  eylem: { alignSelf: "stretch" },
});
