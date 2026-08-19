import { useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { usePalet } from "../../design/theme";
import { s, yazi, type Palet } from "../../design/tokens";
import { Defs, Pattern } from "../kepenk/svg-cocuklu";
import { useSvgKimlik } from "../kepenk/svg-kimlik";
import { tenteDeseni } from "../kepenk/tente-desen";
import {
  ayGenisligi,
  aylaraGrupla,
  dukkanCatiYuksekligi,
  dukkanKatSayisi,
  dukkanParlakligi,
  dukkanPencereRengi,
  dukkanZiyaretSayilari,
  isikHavuzuYolu,
  korniyYolu,
  partiDuvariYolu,
  sokakCatiTavani,
  sokakYuksekligi,
  tenteSeritYolu,
  tenteYolu,
  terasYolu,
  ustPencereler,
  CEPHE_PAY,
  DUKKAN_GENISLIK,
  KALDIRIM_KALINLIK,
  KAPALI_DUKKAN_YUKSEKLIGI,
  KAPI_GENISLIK,
  KAPI_PARLAKLIK,
  KAPI_TEPE_YUKSEKLIK,
  KAPI_X,
  KAPI_YUKSEKLIK,
  KAYIT_GENISLIK,
  KERB_KALINLIK,
  KEPENK_DUDAK,
  KEPENK_LENTO_YUKSEKLIK,
  LAMBA_YUKSEKLIK,
  OLUK_ADIM,
  PENCERE_ESIK,
  PENCERE_GENISLIK,
  PENCERE_X,
  PENCERE_YUKSEKLIK,
  SOKAK_DEVAM_DUKKAN_SAYISI,
  TENTE_GENISLIK,
  TENTE_TABAN,
  TENTE_X,
  TENTE_YUKSEKLIK,
  UST_KAT_PARLAKLIK_ORANI,
  UST_PENCERE_GENISLIK,
  UST_PENCERE_YUKSEKLIK,
  VITRIN_GENISLIK,
  VITRIN_YUKSEKLIK,
  ZEMIN_KAT_YUKSEKLIK,
  type AySokagi,
  type KurtarmaKaydi,
} from "./sokak-hesap";

/**
 * The street is DRAWN in the geometry's own units and SHOWN at this
 * multiple.
 *
 * At 1:1 a month of rescues was a 40pt strip of small blocks — the reward
 * loop of the whole product rendering as something you would mistake for
 * a progress bar. At 2.2 it was legible enough to reveal that the drawing
 * underneath was a brown box with a pink cap. It is now a shopfront with
 * a window, a door, a glazing bar and a fanlight, and 2.5 is what those
 * need: a frontage lands at 65pt wide, close to the 68pt band the card's
 * own shutter occupies, which is the size this vocabulary was drawn for.
 *
 * The extra scale costs nothing vertically, because the strip no longer
 * reserves room for a four-times regular on every profile — see
 * `sokakCatiTavani`. A street of one-time rescues is now SHORTER on
 * screen than it was at 2.2, and a taller one is only taller for the user
 * who earned it.
 *
 * A `viewBox` rather than bigger constants: every coordinate in
 * sokak-hesap.ts, and every test pinned to one, keeps its meaning, and
 * the street already scrolls horizontally so a long month simply runs
 * further down the road.
 */
export const SOKAK_OLCEGI = 2.5;

/** The cornice and the party wall, in drawing units. Both are hairlines
 * at this scale — 1.5pt and 1.25pt on screen — because the terrace's
 * articulation should be an edge catching light, never a drawn grid. */
const KORNIY_KALINLIK = 0.6;
const PARTI_KALINLIK = 0.5;

/**
 * SENİN SOKAĞIN — spec §4.7, the reward loop of the whole product and the
 * only place the user sees what they have accumulated.
 *
 * A horizontally scrolling street elevation: every rescue adds a
 * storefront with its own hashed awning stripe, its shutter UP and its
 * window lit. Shops rescued more than once are drawn taller and brighter.
 * One `<Svg>` per month.
 *
 * It is a TERRACE — adjoining façades sharing party walls, standing on
 * one continuous pavement, under a roofline that steps. That is the
 * difference between a street and a bar chart, and it is why the whole
 * block is one `<Path>` rather than a rect per shop: a chart is made of
 * separate objects on a baseline, a street is one built thing with
 * openings cut into it. Only the openings are per-shop.
 *
 * This is a picture, not a chart: there is no axis, no gridline and no
 * number printed on a storefront. The three numbers the street earns
 * (paket / kg / ₺) are printed once, below the whole thing, off the API's
 * own totals.
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

  // ONE roofline ceiling for the whole street, not one per month: the
  // months sit side by side in a single scroll view and a per-month
  // height would step their labels up and down as you scrolled.
  const catiTavani = sokakCatiTavani(kayitlar, ziyaretSayilari);

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
            catiTavani={catiTavani}
            ziyaretSayilari={ziyaretSayilari}
            dukkanAdi={dukkanAdi}
            palet={palet}
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
  catiTavani,
  ziyaretSayilari,
  dukkanAdi,
  palet,
  t,
}: {
  ay: AySokagi;
  /** Whether this is the most recent month — the street's one growing
   * edge, where the continuation frontages belong (see `sokak-hesap.ts`'s
   * `SOKAK_DEVAM_DUKKAN_SAYISI`). Every earlier month is settled history
   * and renders exactly its own rescues, nothing more. */
  sonAy: boolean;
  catiTavani: number;
  ziyaretSayilari: Map<string, number>;
  dukkanAdi: (storeId: string) => string | null;
  palet: Palet;
  t: TFunction;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={aySozelOzeti(ay, sonAy, ziyaretSayilari, dukkanAdi, t)}
      style={styles.aySatiri}
    >
      <Text
        style={[yazi.data, styles.ayEtiket, { color: palet.yaziSisZemin }]}
        maxFontSizeMultiplier={1.3}
      >
        {ay.etiket}
      </Text>
      <SokakCizimi
        kayitlar={ay.kayitlar}
        ziyaretSayilari={ziyaretSayilari}
        kapaliSayisi={sonAy ? SOKAK_DEVAM_DUKKAN_SAYISI : 0}
        catiTavani={catiTavani}
        palet={palet}
      />
    </View>
  );
}

/**
 * One block of the street: the pavement, the terrace, and the openings
 * cut into it — the lit ones you rescued, then the shuttered ones you
 * have not.
 *
 * Node budget. The spec's §5.3 rule ("one draw call, not 300 nodes") is
 * about a shutter inside a recycling FlashList window. This `<Svg>` is
 * static, mounted once on a screen with no list under it, and its
 * repeated structure — every façade, every cornice, every party wall — is
 * still exactly three paths no matter how many shops stand in it. What is
 * per-shop is only the shopfront itself, because a shopfront is the one
 * thing on this drawing that is NOT repeated: it is either lit or shut,
 * and if it is lit it wears that shop's own awning.
 */
function SokakCizimi({
  kayitlar,
  ziyaretSayilari,
  kapaliSayisi,
  catiTavani,
  palet,
}: {
  kayitlar: readonly KurtarmaKaydi[];
  ziyaretSayilari: Map<string, number>;
  kapaliSayisi: number;
  catiTavani: number;
  palet: Palet;
}) {
  const olukKimlik = useSvgKimlik("sokak-oluk");
  const svgYuksekligi = sokakYuksekligi(catiTavani);
  // The pavement's top edge — every façade's feet, whatever the roofline
  // above them, stand on this one line. With the <Svg> sized from the
  // street's own tallest roofline, that line is exactly `catiTavani`.
  const tabanY = catiTavani;

  const catilar = [
    ...kayitlar.map((kayit) =>
      dukkanCatiYuksekligi(kayit.storeId, ziyaretSayilari.get(kayit.storeId) ?? 1),
    ),
    ...Array.from({ length: kapaliSayisi }, () => KAPALI_DUKKAN_YUKSEKLIGI),
  ];
  const genislik = ayGenisligi(catilar.length);

  return (
    <Svg
      width={genislik * SOKAK_OLCEGI}
      height={svgYuksekligi * SOKAK_OLCEGI}
      viewBox={`0 0 ${genislik} ${svgYuksekligi}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {kapaliSayisi > 0 ? (
        <Defs>
          {/* The shutter's corrugation, exactly the card's: ONE
              <Pattern>-filled rect per frontage, never a <Rect> per slat
              (spec §5.3). One definition serves every closed frontage in
              this month's <Svg>. */}
          <Pattern
            id={olukKimlik}
            x={0}
            y={0}
            width={OLUK_ADIM}
            height={1}
            patternUnits="userSpaceOnUse"
          >
            <Rect x={0} y={0} width={OLUK_ADIM / 2} height={1} fill={palet.metalAcik} />
            <Rect
              x={OLUK_ADIM / 2}
              y={0}
              width={OLUK_ADIM / 2}
              height={1}
              fill={palet.metalKoyu}
            />
          </Pattern>
        </Defs>
      ) : null}

      {/* The pavement, continuous under every frontage — rescued or not,
          because it is one street — and the kerb where it drops to the
          road. The old drawing's only ground was a hairline that the
          night palette swallowed whole. */}
      <Rect
        x={0}
        y={tabanY}
        width={genislik}
        height={KALDIRIM_KALINLIK}
        fill={palet.cizgiKil}
      />
      <Rect
        x={0}
        y={tabanY + KALDIRIM_KALINLIK}
        width={genislik}
        height={KERB_KALINLIK}
        fill={palet.metalCinko}
      />

      {kayitlar.map((kayit, i) => (
        <Path
          key={`havuz-${kayit.reservationId}`}
          d={isikHavuzuYolu(i * DUKKAN_GENISLIK, tabanY)}
          fill={`rgba(${palet.isikRgb},${(
            0.2 +
            0.22 * dukkanParlakligi(ziyaretSayilari.get(kayit.storeId) ?? 1)
          ).toFixed(3)})`}
        />
      ))}

      {/* The terrace: one closed path for every façade on the block. */}
      {/* The wall takes `yuzeyYukselti`, the palette's RAISED surface,
          rather than the card face: against the night street the card
          face is only one step off the asphalt and the buildings simply
          did not appear — you saw shopfronts hanging in a void. A
          terrace has to be a mass before it can have holes cut in it. */}
      <Path testID="sokak-teras" d={terasYolu(catilar, tabanY)} fill={palet.yuzeyYukselti} />
      <Path
        d={partiDuvariYolu(catilar, tabanY)}
        stroke={palet.bgDerin}
        strokeWidth={PARTI_KALINLIK}
        fill="none"
      />
      <Path
        d={korniyYolu(catilar, tabanY)}
        stroke={palet.cizgiKil}
        strokeWidth={KORNIY_KALINLIK}
        fill="none"
      />

      {kayitlar.map((kayit, i) => (
        <AydinlikDukkan
          key={kayit.reservationId}
          x={i * DUKKAN_GENISLIK}
          tabanY={tabanY}
          cati={catilar[i]!}
          sayac={ziyaretSayilari.get(kayit.storeId) ?? 1}
          storeId={kayit.storeId}
          palet={palet}
        />
      ))}

      {Array.from({ length: kapaliSayisi }, (_, j) => (
        <KapaliDukkan
          key={`devam-${j}`}
          x={(kayitlar.length + j) * DUKKAN_GENISLIK}
          tabanY={tabanY}
          olukKimlik={olukKimlik}
          palet={palet}
        />
      ))}
    </Svg>
  );
}

/**
 * A shop you rescued from: shutter up, lamp on, awning out.
 *
 * Everything that says "inhabited" is here — a framed window with a
 * glazing bar and a lit band where the lamp hangs, a door with a lit
 * fanlight over it, and the pool that light throws across the pavement.
 * At ONE rescue this is already unmistakably lit (see
 * `DUKKAN_TABAN_PARLAKLIK`): the single most-viewed frame on this screen
 * cannot be the dimmest one the scale can produce.
 */
function AydinlikDukkan({
  x,
  tabanY,
  cati,
  sayac,
  storeId,
  palet,
}: {
  x: number;
  tabanY: number;
  /** This building's own parapet — the awning and the shopfront are at a
   * fixed height, only the wall above them varies. */
  cati: number;
  sayac: number;
  storeId: string;
  palet: Palet;
}) {
  const parlaklik = dukkanParlakligi(sayac);
  const desen = tenteDeseni(storeId);
  // The glass lerps toward SODIUM, not toward the lamp's pale core. The
  // core (`isikCekirdek`) is a warm white: mixed down from it, a window
  // resolves to tan, which is what made the first pass of this drawing
  // read as a brown box even after the floor was raised. The body of a
  // lit window is the lamp's own hue at full saturation; the pale core is
  // kept for the one band where the lamp physically is.
  const cam = dukkanPencereRengi(palet.vitrinZemin, palet.sodyumDolgu, parlaklik);
  const kapi = dukkanPencereRengi(palet.vitrinZemin, palet.sodyumDolgu, KAPI_PARLAKLIK);
  const ustCam = dukkanPencereRengi(
    palet.vitrinZemin,
    palet.sodyumDolgu,
    parlaklik * UST_KAT_PARLAKLIK_ORANI,
  );
  // Heights are counted UP from the pavement; the drawing counts down.
  const y = (yukseklik: number) => tabanY - yukseklik;
  const pencereTepe = PENCERE_ESIK + PENCERE_YUKSEKLIK;

  return (
    <G testID="sokak-dukkan">
      {/* The shopfront: one dark painted frame with the glass and the
          door set into it. Dark in every phase (it takes the zinc lip's
          own colour, not a ground token) because it is the surround that
          makes the light inside read as light. */}
      <Rect
        x={x + CEPHE_PAY}
        y={y(VITRIN_YUKSEKLIK)}
        width={VITRIN_GENISLIK}
        height={VITRIN_YUKSEKLIK}
        fill={palet.metalDudak}
      />
      <Rect
        x={x + PENCERE_X}
        y={y(pencereTepe)}
        width={PENCERE_GENISLIK}
        height={PENCERE_YUKSEKLIK}
        fill={cam}
      />
      {/* The lamp itself, at full strength whatever the visit count —
          the one thing on a rescued frontage brighter than any surface
          on it, exactly as the card's core is inside the vitrin. */}
      <Rect
        x={x + PENCERE_X}
        y={y(pencereTepe)}
        width={PENCERE_GENISLIK}
        height={LAMBA_YUKSEKLIK}
        fill={palet.isikCekirdek}
      />
      <Rect
        x={x + PENCERE_X + PENCERE_GENISLIK / 2 - KAYIT_GENISLIK / 2}
        y={y(pencereTepe)}
        width={KAYIT_GENISLIK}
        height={PENCERE_YUKSEKLIK}
        fill={palet.metalDudak}
      />
      <Rect
        x={x + KAPI_X}
        y={y(KAPI_YUKSEKLIK)}
        width={KAPI_GENISLIK}
        height={KAPI_YUKSEKLIK}
        fill={kapi}
      />
      <Rect
        x={x + KAPI_X}
        y={y(KAPI_YUKSEKLIK)}
        width={KAPI_GENISLIK}
        height={KAPI_TEPE_YUKSEKLIK}
        fill={palet.isikCekirdek}
      />

      {/* The flats above: one row per repeat visit, so a regular's
          building is INHABITED rather than merely tall. */}
      {ustPencereler(cati, dukkanKatSayisi(sayac)).map((pencere) => (
        <Rect
          key={`${pencere.x}-${pencere.taban}`}
          x={x + pencere.x}
          y={y(pencere.taban + UST_PENCERE_YUKSEKLIK)}
          width={UST_PENCERE_GENISLIK}
          height={UST_PENCERE_YUKSEKLIK}
          fill={ustCam}
        />
      ))}

      {/* The awning — the shop's permanent identity mark (spec §3), in
          the same hashed pair the card, the map pin and the order row
          wear, striped along its own scallops. */}
      <Path
        d={tenteYolu(TENTE_GENISLIK, TENTE_TABAN, TENTE_YUKSEKLIK - TENTE_TABAN)}
        transform={`translate(${x + TENTE_X} ${y(ZEMIN_KAT_YUKSEKLIK)})`}
        fill={desen.bir}
      />
      <Path
        d={tenteSeritYolu(TENTE_GENISLIK, TENTE_TABAN, TENTE_YUKSEKLIK - TENTE_TABAN)}
        transform={`translate(${x + TENTE_X} ${y(ZEMIN_KAT_YUKSEKLIK)})`}
        fill={desen.iki}
      />
    </G>
  );
}

/**
 * A closed, un-rescued frontage — the street's continuation past the most
 * recent rescue (review: "unlit, un-rescued frontages ahead of the one you
 * have lit").
 *
 * It is a SHUT SHOP, in the app's own shutter language: the lintel box
 * the kepenk rolls out of, corrugated steel all the way down, the bottom
 * lip the eye tracks and the specular line above it. It was a grey slab,
 * which said "placeholder"; a shutter says "a shop that is closed", which
 * is the truth and is also the only frame in this app that can make the
 * lit one beside it mean anything. No awning, no light, and a lower
 * parapet than any real rescue's — it must never be mistakable for
 * something you achieved.
 */
function KapaliDukkan({
  x,
  tabanY,
  olukKimlik,
  palet,
}: {
  x: number;
  tabanY: number;
  olukKimlik: string;
  palet: Palet;
}) {
  const y = (yukseklik: number) => tabanY - yukseklik;
  return (
    <G testID="sokak-kapali">
      <Rect
        x={x + CEPHE_PAY}
        y={y(VITRIN_YUKSEKLIK + KEPENK_LENTO_YUKSEKLIK)}
        width={VITRIN_GENISLIK}
        height={KEPENK_LENTO_YUKSEKLIK}
        fill={palet.metalKoyu}
      />
      <Rect
        x={x + CEPHE_PAY}
        y={y(VITRIN_YUKSEKLIK)}
        width={VITRIN_GENISLIK}
        height={VITRIN_YUKSEKLIK - KEPENK_DUDAK}
        fill={`url(#${olukKimlik})`}
      />
      <Rect
        x={x + CEPHE_PAY}
        y={y(KEPENK_DUDAK + 0.5)}
        width={VITRIN_GENISLIK}
        height={0.5}
        fill={palet.kepenkDudakIsik}
      />
      <Rect
        x={x + CEPHE_PAY}
        y={y(KEPENK_DUDAK)}
        width={VITRIN_GENISLIK}
        height={KEPENK_DUDAK}
        fill={palet.metalDudak}
      />
    </G>
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

/** No rescues yet: the same street, entirely shuttered. The empty state
 * and the growing edge are deliberately the identical drawing, because
 * they are the identical fact — this is a shop you have not opened. */
function BosSokak() {
  const { t } = useTranslation();
  const palet = usePalet();
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={t("profile.sokakBos")}>
      <View style={styles.icerik}>
        <SokakCizimi
          kayitlar={[]}
          ziyaretSayilari={new Map()}
          kapaliSayisi={SOKAK_DEVAM_DUKKAN_SAYISI}
          catiTavani={KAPALI_DUKKAN_YUKSEKLIGI}
          palet={palet}
        />
      </View>
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
