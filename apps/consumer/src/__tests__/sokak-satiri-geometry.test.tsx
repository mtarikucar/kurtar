import { render, screen } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { Dimensions, View } from "react-native";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import {
  KESIF_SAG_KENAR,
  KESIF_SOL_KENAR,
  SPINE_BOSLUK,
  SPINE_HAIRLINE_GENISLIGI,
  spineEtiketGenisligi,
} from "../components/kesif/duzen";
import { SokakSatiri } from "../components/kesif/SokakSatiri";
import { SokakYukleniyor } from "../components/kesif/SokakYukleniyor";
import "../i18n";

const KART_GENISLIGI = 313;
/** Both frames read the SAME viewport through `useWindowDimensions`, so
 * the column they reserve is whatever that width and the user's text
 * scale come to — the point of these specs is that it is the same number
 * in both, not what the number happens to be. */
const SPINE_KOLON_GENISLIGI = () =>
  spineEtiketGenisligi(Dimensions.get("window").width) +
  SPINE_BOSLUK +
  SPINE_HAIRLINE_GENISLIGI;

/** Recursively collects every numeric value under a given style key
 * anywhere in a rendered RNTL JSON tree. Used to prove the loading
 * placeholder and a loaded row declare the exact same street-spine
 * geometry (review fix #3), without hand-simulating Yoga layout. */
function stilDegerleriTopla(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
  anahtar: string,
): number[] {
  if (!dugum) return [];
  if (Array.isArray(dugum)) {
    return dugum.flatMap((d) => stilDegerleriTopla(d, anahtar));
  }
  const sonuclar: number[] = [];
  const stil = dugum.props?.style;
  const stiller = Array.isArray(stil) ? stil : [stil];
  for (const s of stiller) {
    if (s && typeof s === "object" && typeof s[anahtar] === "number") {
      sonuclar.push(s[anahtar]);
    }
  }
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") {
      sonuclar.push(...stilDegerleriTopla(cocuk, anahtar));
    }
  }
  return sonuclar;
}

const SABIT_ZAMAN = new Date("2026-08-19T19:00:00.000Z"); // 22:00 Istanbul — gece regardless

function sarici(cocuk: React.ReactNode) {
  return (
    <ClockProvider sabitZaman={SABIT_ZAMAN}>
      <ThemeProvider fazZorla="gece">{cocuk}</ThemeProvider>
    </ClockProvider>
  );
}

describe("street-spine geometry — loading vs loaded (review fix #3)", () => {
  it("SokakYukleniyor's own left/right inset is the SAME constants the loaded list's contentContainerStyle uses", async () => {
    const { unmount } = await render(
      sarici(<SokakYukleniyor kartGenisligi={KART_GENISLIGI} adet={1} />),
    );
    const kok = screen.toJSON();
    expect(stilDegerleriTopla(kok, "paddingLeft")).toContain(KESIF_SOL_KENAR);
    expect(stilDegerleriTopla(kok, "paddingRight")).toContain(KESIF_SAG_KENAR);
    await unmount();
  });

  it("each closed-shutter placeholder reserves the exact spine column width a loaded row declares", async () => {
    const yukleniyorRender = await render(
      sarici(<SokakYukleniyor kartGenisligi={KART_GENISLIGI} adet={1} />),
    );
    const yukleniyor = screen.toJSON();
    await yukleniyorRender.unmount();

    const yukluRender = await render(
      sarici(
        <SokakSatiri mesafeM={1277}>
          <View style={{ width: KART_GENISLIGI, height: 196 }} />
        </SokakSatiri>,
      ),
    );
    const yuklu = screen.toJSON();
    await yukluRender.unmount();

    // Same column width in both — the number is what differs, not the
    // geometry it sits in.
    expect(stilDegerleriTopla(yukleniyor, "width")).toContain(SPINE_KOLON_GENISLIGI());
    expect(stilDegerleriTopla(yuklu, "width")).toContain(SPINE_KOLON_GENISLIGI());

    // And the card itself is the same width in both, so nothing shifts
    // horizontally when the real offer swaps in for the placeholder.
    expect(stilDegerleriTopla(yukleniyor, "width")).toContain(KART_GENISLIGI);
    expect(stilDegerleriTopla(yuklu, "width")).toContain(KART_GENISLIGI);
  });

  it("SokakSatiri with mesafeM=null (the loading frame) keeps the hairline column at the same width as a real distance", async () => {
    const { unmount } = await render(
      sarici(
        <SokakSatiri mesafeM={null}>
          <View style={{ width: KART_GENISLIGI, height: 196 }} />
        </SokakSatiri>,
      ),
    );
    const bos = screen.toJSON();
    expect(stilDegerleriTopla(bos, "width")).toContain(SPINE_KOLON_GENISLIGI());
    // No distance is printed — real data this frame does not have yet.
    expect(JSON.stringify(bos)).not.toContain("1,3 km");
    await unmount();
  });

  it("SokakSatiri with a real mesafeM prints the distance in the same spine column", async () => {
    const { unmount } = await render(
      sarici(
        <SokakSatiri mesafeM={1277}>
          <View style={{ width: KART_GENISLIGI, height: 196 }} />
        </SokakSatiri>,
      ),
    );
    const dolu = screen.toJSON();
    expect(stilDegerleriTopla(dolu, "width")).toContain(SPINE_KOLON_GENISLIGI());
    expect(JSON.stringify(dolu)).toContain("1,3 km");
    await unmount();
  });
});
