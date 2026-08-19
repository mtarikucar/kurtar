import { StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Defs, Pattern } from "./svg-cocuklu";
import { kart } from "../../design/tokens";
import { useSvgKimlik } from "./svg-kimlik";
import type { TenteDeseni } from "./tente-desen";

/**
 * TENTE — the 6pt awning strip at the top of every card (spec §3).
 *
 * 14pt diagonal stripes as ONE `<Pattern>`-filled rect: the shop's
 * permanent identity mark, drawn rather than fetched. No logo, no photo,
 * no cache.
 */
export function Tente({
  genislik,
  yukseklik = kart.tente,
  desen,
}: {
  genislik: number;
  yukseklik?: number;
  desen: TenteDeseni;
}) {
  const kimlik = useSvgKimlik("tente");
  const serit = 14;

  return (
    <View
      style={[styles.kap, { width: genislik, height: yukseklik }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={genislik} height={yukseklik}>
        <Defs>
          <Pattern
            id={kimlik}
            x={0}
            y={0}
            width={serit * 2}
            height={serit * 2}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <Rect x={0} y={0} width={serit} height={serit * 2} fill={desen.bir} />
            <Rect x={serit} y={0} width={serit} height={serit * 2} fill={desen.iki} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={genislik} height={yukseklik} fill={`url(#${kimlik})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { overflow: "hidden" },
});
