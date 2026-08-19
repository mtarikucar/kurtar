import { useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { usePalet } from "../../design/theme";
import { s, yazi } from "../../design/tokens";
import { tenteDeseni } from "../kepenk/tente-desen";
import {


  ayGenisligi,
  ayGenisligiDevamli,
  aylaraGrupla,
  dukkanParlakligi,
  dukkanPencereRengi,
  dukkanPencereX,
  dukkanYuksekligi,
  dukkanZiyaretSayilari,
  tenteYolu,
  DUKKAN_ARALIK,
  DUKKAN_GENISLIK,
  DUKKAN_PENCERE_GENISLIK,
  KALDIRIM_Y,
  KAPALI_DUKKAN_YUKSEKLIGI,
  SOKAK_DEVAM_DUKKAN_SAYISI,
  SOKAK_SVG_YUKSEKLIGI,
  TENTE_TABAN,
  TENTE_YUKSEKLIK,
  type AySokagi,
  type KurtarmaKaydi,
} from "./sokak-hesap";

/**
 * The street is DRAWN in the geometry's own units and SHOWN at this
 * multiple.
 *
 * At 1:1 a month of rescues was a 40pt strip of small blocks — the reward
 * loop of the whole product rendering as something you would mistake for
 * a progress bar. The shops have to be big enough that an awning reads as
 * an awning and a lit window as a lit window; below that the drawing is
 * saying nothing it took the trouble to draw.
 *
 * A `viewBox` rather than bigger constants: every coordinate in
 * sokak-hesap.ts, and every test pinned to one, keeps its meaning, and
 * the street already scrolls horizontally so a long month simply runs
 * further down the road.
 */
export const SOKAK_OLCEGI = 2.2;

/**
 * SENİN SOKAĞIN — spec §4.7, the reward loop of the whole product and the
 * only place the user sees what they have accumulated.
 *
 * A horizontally scrolling street elevation: every rescue adds a
 * storefront with its own hashed awning stripe, its shutter UP and its
 * window lit. Shops rescued more than once are drawn taller and brighter.
 * One `<Svg>` per month, no per-shop nodes beyond a rect (the window) and
 * a stripe (the awning) — this is a picture, not a chart: there is no
 * axis, no gridline and no number printed on a storefront. The three
 * numbers the street earns (paket / kg / ₺) are printed once, below the
 * whole thing, off the API's own totals.
 */
export function SeninSokagin({
  kayitlar,
  dukkanAdi,
}: {
  kayitlar: readonly KurtarmaKaydi[];
  /** Resolves a storeId to a human name for the accessibility summary.
   * Returns null while the name hasn't loaded yet — the summary still
   * reports a count, just not a name, rather than blocking on it. */
  dukkanAdi: (storeId: string) => string | null;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const scrollRef = useRef<ScrollView>(null);
  const enSonKaydirildi = useRef(false);

  const aylar = aylaraGrupla(kayitlar);
  const ziyaretSayilari = dukkanZiyaretSayilari(kayitlar);

  if (aylar.length === 0) {
    return <BosSokak />;
  }

  // "Scroll left through your street; the far end is where you started"
  // (spec) — the street opens at the RIGHT edge, showing the most recent
  // rescue first, exactly once (a later re-render — e.g. a fresh rescue
  // arriving — must not yank the user's scroll position back).
  const acilisKaydirmasi = (genislik: number) => {
    if (enSonKaydirildi.current) return;
    enSonKaydirildi.current = true;
    scrollRef.current?.scrollTo({ x: genislik, animated: false });
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.icerik}
        onContentSizeChange={acilisKaydirmasi}
      >
        {aylar.map((ay, i) => (
          <AySatiri
            key={ay.anahtar}
            ay={ay}
            sonAy={i === aylar.length - 1}
            ziyaretSayilari={ziyaretSayilari}
            dukkanAdi={dukkanAdi}
            vitrinZemin={palet.vitrinZemin}
            isikCekirdek={palet.isikCekirdek}
            t={t}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function AySatiri({
  ay,
  sonAy,
  ziyaretSayilari,
  dukkanAdi,
  vitrinZemin,
  isikCekirdek,
  t,
}: {
  ay: AySokagi;
  /** Whether this is the most recent month — the street's one growing
   * edge, where the continuation frontages belong (see `sokak-hesap.ts`'s
   * `SOKAK_DEVAM_DUKKAN_SAYISI`). Every earlier month is settled history
   * and renders exactly its own rescues, nothing more. */
  sonAy: boolean;
  ziyaretSayilari: Map<string, number>;
  dukkanAdi: (storeId: string) => string | null;
  /** The phase's own unlit-shop-interior colour — a single-visit window's
   * dim end of the lerp (dukkanPencereRengi). */
  vitrinZemin: string;
  /** The phase's own bright sodium core — a regular's blazing end. */
  isikCekirdek: string;
  t: TFunction;
}) {
  const palet = usePalet();
  const genislik = sonAy
    ? ayGenisligiDevamli(ay.kayitlar.length)
    : ayGenisligi(ay.kayitlar.length);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={aySozelOzeti(ay, sonAy, ziyaretSayilari, dukkanAdi, t)}
      style={styles.aySatiri}
    >
      <Text style={[yazi.data, styles.ayEtiket, { color: palet.yaziSisZemin }]} maxFontSizeMultiplier={1.3}>
        {ay.etiket}
      </Text>
      <Svg
        width={genislik * SOKAK_OLCEGI}
        height={SOKAK_SVG_YUKSEKLIGI * SOKAK_OLCEGI}
        viewBox={`0 0 ${genislik} ${SOKAK_SVG_YUKSEKLIGI}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Rect
          x={0}
          y={KALDIRIM_Y}
          width={genislik}
          height={1}
          fill={palet.cizgiKil}
        />
        {ay.kayitlar.map((kayit, i) => {
          const sayac = ziyaretSayilari.get(kayit.storeId) ?? 1;
          const yukseklik = dukkanYuksekligi(sayac);
          const parlaklik = dukkanParlakligi(sayac);
          const desen = tenteDeseni(kayit.storeId);
          const x = i * (DUKKAN_GENISLIK + DUKKAN_ARALIK);
          return (
            <RectGroupDukkan
              key={kayit.reservationId}
              x={x}
              yukseklik={yukseklik}
              parlaklik={parlaklik}
              awningColor={desen.bir}
              vitrinZemin={vitrinZemin}
              isikCekirdek={isikCekirdek}
            />
          );
        })}
        {sonAy
          ? Array.from({ length: SOKAK_DEVAM_DUKKAN_SAYISI }, (_, j) => {
              const x = (ay.kayitlar.length + j) * (DUKKAN_GENISLIK + DUKKAN_ARALIK);
              return <KapaliDukkan key={`devam-${j}`} x={x} metalCinko={palet.metalCinko} />;
            })
          : null}
      </Svg>
    </View>
  );
}

/**
 * A closed, un-rescued frontage — the street's continuation past the most
 * recent rescue (review: "unlit, un-rescued frontages ahead of the one you
 * have lit"). Deliberately the SAME shape the fully-empty street already
 * uses (`BosSokak`): a plain zinc block, shorter than a real storefront's
 * floor, no awning and no lit window, because there is no shop identity to
 * draw yet and nothing here has been rescued. One `<Rect>`, same budget as
 * a real storefront's window.
 */
function KapaliDukkan({ x, metalCinko }: { x: number; metalCinko: string }) {
  return (
    <Rect
      x={x}
      y={KALDIRIM_Y - KAPALI_DUKKAN_YUKSEKLIGI}
      width={DUKKAN_GENISLIK}
      height={KAPALI_DUKKAN_YUKSEKLIGI}
      fill={metalCinko}
    />
  );
}

/** Exactly two shapes per shop — a rect (the lit window, shutter fully
 * up) and a stripe (the awning) — per spec's engineering rule for this
 * surface. No bolts, no glyph, no shutter geometry: that budget is spent
 * on the offer card, not on a 26pt street elevation. */
function RectGroupDukkan({
  x,
  yukseklik,
  parlaklik,
  awningColor,
  vitrinZemin,
  isikCekirdek,
}: {
  x: number;
  yukseklik: number;
  parlaklik: number;
  awningColor: string;
  vitrinZemin: string;
  isikCekirdek: string;
}) {
  const pencereY = KALDIRIM_Y - yukseklik;
  const pencereRengi = dukkanPencereRengi(vitrinZemin, isikCekirdek, parlaklik);
  return (
    <>
      {/* The awning spans the full slot — wider than the window below it,
          exactly as a real shop awning overhangs the glass — and its
          bottom edge is scalloped, the standard shorthand for a fabric
          canopy in every icon set that draws one (spec: "no per-shop
          nodes beyond a rect and a stripe" — this IS the stripe, just
          not a rectangle). Nothing about a zigzag edge exists in chart
          iconography, which is the whole point of it. */}
      <Path
        d={tenteYolu(DUKKAN_GENISLIK, TENTE_TABAN, TENTE_YUKSEKLIK - TENTE_TABAN)}
        transform={`translate(${x} ${pencereY - TENTE_YUKSEKLIK})`}
        fill={awningColor}
      />
      {/* The window is INSET from the awning's edges — wall/pillar shows
          on each side under the awning. A window spanning the full slot
          is an unbroken colour block indistinguishable from a bar
          chart's fill; the inset is what makes it read as glass in a
          facade instead. */}
      <Rect
        x={dukkanPencereX(x)}
        y={pencereY}
        width={DUKKAN_PENCERE_GENISLIK}
        height={yukseklik}
        rx={1}
        fill={pencereRengi}
      />
    </>
  );
}

/** One composed label per month — a screen reader lands on this the same
 * way it lands on any list item, not on "scroll right to see more of a
 * canvas". Every rescue that month is accounted for by name (once a name
 * has loaded) and count. On the most recent month, it also says — in
 * words — what the sighted view now shows in pixels: the street keeps
 * going past what you have lit. That is the parity a decorative-only
 * `accessibilityElementsHidden` <Svg> cannot provide by itself. */
function aySozelOzeti(
  ay: AySokagi,
  sonAy: boolean,
  ziyaretSayilari: Map<string, number>,
  dukkanAdi: (storeId: string) => string | null,
  t: TFunction,
): string {
  const buAyIcindeSayim = new Map<string, number>();
  for (const kayit of ay.kayitlar) {
    buAyIcindeSayim.set(kayit.storeId, (buAyIcindeSayim.get(kayit.storeId) ?? 0) + 1);
  }
  const parcalar = [...buAyIcindeSayim.entries()].map(([storeId, ayIciSayac]) => {
    const ad = dukkanAdi(storeId);
    const toplam = ziyaretSayilari.get(storeId) ?? ayIciSayac;
    if (ad) {
      return toplam > 1
        ? t("profile.sokakDukkanTekrar", { ad, sayac: toplam })
        : ad;
    }
    return t("profile.sokakKurtarmaSayisi", { count: ayIciSayac });
  });
  const ozet = t("profile.sokakAySozeti", { ay: ay.etiket, liste: parcalar.join(", ") });
  return sonAy ? `${ozet}. ${t("profile.sokakDevamIpucu")}` : ozet;
}

function BosSokak() {
  const { t } = useTranslation();
  const palet = usePalet();
  const genislik = ayGenisligi(SOKAK_DEVAM_DUKKAN_SAYISI);
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={t("profile.sokakBos")}>
      <Svg
        width={genislik}
        height={SOKAK_SVG_YUKSEKLIGI}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Rect x={0} y={KALDIRIM_Y} width={genislik} height={1} fill={palet.cizgiKil} />
        {Array.from({ length: SOKAK_DEVAM_DUKKAN_SAYISI }, (_, i) => {
          const x = i * (DUKKAN_GENISLIK + DUKKAN_ARALIK);
          return <KapaliDukkan key={i} x={x} metalCinko={palet.metalCinko} />;
        })}
      </Svg>
      <Text style={[yazi.data, styles.bosMetin, { color: palet.yaziSisZemin }]}>
        {t("profile.sokakBos")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: s.s5,
    paddingHorizontal: s.s1,
  },
  aySatiri: {
    alignItems: "flex-start",
  },
  ayEtiket: {
    marginBottom: s.s2,
  },
  bosMetin: {
    marginTop: s.s2,
    maxWidth: 220,
  },
});
