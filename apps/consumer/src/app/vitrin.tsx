import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { DegerCubugu } from "../components/kepenk/DegerCubugu";
import { StokCipi } from "../components/kepenk/StokCipi";
import { Tente } from "../components/kepenk/Tente";
import { VitrinKarti, type VitrinTeklifi } from "../components/kepenk/VitrinKarti";
import { ZamanHapi } from "../components/kepenk/ZamanHapi";
import {
  ALIS_BASLANGIC,
  GERCEK_TEKLIFLER,
  INCELEME_ANLARI,
  UZUN_BASLANGIC,
  type IncelemeAni,
} from "../components/kepenk/gercek-teklifler";
import { degerOrani } from "../components/kepenk/olcum";
import { TENTE_DESENLERI } from "../components/kepenk/tente-desen";
import { saatBulunma } from "../components/kepenk/tr-saat";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { kart, PALETLER, s, yazi, type Faz, type Palet } from "../design/tokens";
import { formatClockTime } from "../lib/format";

/**
 * The Phase 1 review gate (spec §6): the four real offers at six
 * simulated times, in all three palette phases, plus every part of the
 * card on its own. If the card is not right here, nothing downstream
 * matters.
 *
 * Open it at /vitrin.
 */

const FAZLAR: readonly Faz[] = ["gece", "alacakaranlik", "gunduz"];
const FAZ_ANAHTARI: Readonly<Record<Faz, string>> = {
  gece: "fazGece",
  alacakaranlik: "fazAlacakaranlik",
  gunduz: "fazGunduz",
};

/** Any instant inside the window: the parts strip is about the parts, not
 * about time. */
const PARCA_ANI = new Date("2026-08-19T16:34:00.000Z");
const ACILIS = saatBulunma(formatClockTime(ALIS_BASLANGIC));

export default function VitrinIncelemeEkrani() {
  const { t } = useTranslation();
  const gece = PALETLER.gece;

  return (
    <SafeAreaView style={[styles.kok, { backgroundColor: gece.bgAsfalt }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.icerik}>
        <View style={styles.baslikAlani}>
          <Text style={[yazi.tabelaXl, { color: gece.yaziAna }]}>
            {t("vitrinInceleme.baslik")}
          </Text>
          <Text style={[yazi.data, styles.altBaslik, { color: gece.yaziSis }]}>
            {t("vitrinInceleme.altBaslik")}
          </Text>
        </View>

        <ParcaSeridi />

        <IsikKarsilastirmasi />

        {FAZLAR.map((faz) => (
          <FazBolumu key={faz} faz={faz} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ParcaSeridi() {
  const { t } = useTranslation();
  const palet = PALETLER.gece;
  const desenler = TENTE_DESENLERI;

  return (
    <ClockProvider sabitZaman={PARCA_ANI}>
      <ThemeProvider fazZorla="gece">
        <View style={[styles.bolum, { backgroundColor: palet.bgAsfalt }]}>
          <Etiket metin={t("vitrinInceleme.parcalar")} palet={palet} />

          <AltEtiket metin={t("vitrinInceleme.tenteler")} palet={palet} />
          <View style={styles.sira}>
            {desenler.map((desen) => (
              <View key={desen.ad} style={styles.tenteOrnek}>
                <Tente genislik={96} yukseklik={10} desen={desen} />
                <Text style={[yazi.micro, { color: palet.yaziSis }]}>{desen.ad}</Text>
              </View>
            ))}
          </View>

          <AltEtiket metin={t("vitrinInceleme.hapler")} palet={palet} />
          <View style={styles.sira}>
            <ZamanHapi
              durum="acik"
              kalanDk={146}
              acilisSaati={ACILIS}
              palet={palet}
              azaltHareket
            />
            <ZamanHapi
              durum="acik"
              kalanDk={56}
              acilisSaati={ACILIS}
              palet={palet}
              azaltHareket
            />
            <ZamanHapi
              durum="acik"
              kalanDk={18}
              acilisSaati={ACILIS}
              palet={palet}
              azaltHareket
            />
            <ZamanHapi
              durum="acilmadi"
              kalanDk={220}
              acilisSaati={ACILIS}
              palet={palet}
              azaltHareket
            />
          </View>

          <AltEtiket metin={t("vitrinInceleme.stoklar")} palet={palet} />
          <View style={styles.sira}>
            {[7, 4, 3, 2, 1].map((adet) => (
              <StokCipi key={adet} adet={adet} palet={palet} azaltHareket={false} />
            ))}
          </View>

          <AltEtiket metin={t("vitrinInceleme.cubuklar")} palet={palet} />
          <View style={styles.cubukAlani}>
            <DegerCubugu oran={degerOrani(18000, 30000, 14900)} palet={palet} />
            <DegerCubugu oran={degerOrani(15000, 22000, 6900)} palet={palet} />
          </View>
        </View>
      </ThemeProvider>
    </ClockProvider>
  );
}

/**
 * The check the light has to pass: one shop, four states, side by side.
 * Cover the pills and the picture still has to say which is which — a
 * closing shop is the brightest thing here, and the two shut-and-not-
 * closing states are dark.
 */
function IsikKarsilastirmasi() {
  const { t } = useTranslation();
  const palet = PALETLER.gece;
  const teklif = GERCEK_TEKLIFLER[1] ?? GERCEK_TEKLIFLER[0]!;
  const bitis = new Date(teklif.alisBitis).getTime();
  const durumlar = [
    {
      anahtar: "isikAcikUzak",
      simdi: new Date(bitis - 180 * 60_000),
      teklif: { ...teklif, alisBaslangic: UZUN_BASLANGIC },
    },
    { anahtar: "isikAcikYakin", simdi: new Date(bitis - 20 * 60_000), teklif },
    {
      anahtar: "isikAcilmadi",
      simdi: new Date(new Date(teklif.alisBaslangic).getTime() - 45 * 60_000),
      teklif,
    },
    {
      anahtar: "isikTukendi",
      simdi: new Date(bitis - 90 * 60_000),
      teklif: { ...teklif, kalanAdet: 0 },
    },
  ];

  return (
    <View style={[styles.bolum, { backgroundColor: palet.bgAsfalt }]}>
      <Etiket metin={t("vitrinInceleme.isik")} palet={palet} />
      <View style={styles.kartlar}>
        {durumlar.map((durum) => (
          <View key={durum.anahtar} style={styles.isikSutunu}>
            <AltEtiket metin={t(`vitrinInceleme.${durum.anahtar}`)} palet={palet} />
            <ClockProvider sabitZaman={durum.simdi}>
              <ThemeProvider fazZorla="gece">
                <VitrinKarti teklif={durum.teklif} />
              </ThemeProvider>
            </ClockProvider>
          </View>
        ))}
      </View>
    </View>
  );
}

function FazBolumu({ faz }: { faz: Faz }) {
  const { t } = useTranslation();
  const palet = PALETLER[faz];

  return (
    <View style={[styles.bolum, { backgroundColor: palet.bgAsfalt }]}>
      <Etiket metin={t(`vitrinInceleme.${FAZ_ANAHTARI[faz]}`)} palet={palet} />
      {INCELEME_ANLARI.map((an) => (
        <View key={an.anahtar} style={styles.anAlani}>
          <AltEtiket metin={t(`vitrinInceleme.${an.anahtar}`)} palet={palet} />
          <ClockProvider sabitZaman={an.simdi}>
            <ThemeProvider fazZorla={faz}>
              <View style={styles.kartlar}>
                {GERCEK_TEKLIFLER.map((teklif) => (
                  <VitrinKarti key={teklif.teklifId} teklif={anaGore(teklif, an)} />
                ))}
              </View>
            </ThemeProvider>
          </ClockProvider>
        </View>
      ))}
    </View>
  );
}

function anaGore(teklif: VitrinTeklifi, an: IncelemeAni): VitrinTeklifi {
  return {
    ...teklif,
    kalanAdet: an.tukendi ? 0 : teklif.kalanAdet,
    alisBaslangic: an.baslangic ?? teklif.alisBaslangic,
  };
}

function Etiket({ metin, palet }: { metin: string; palet: Palet }) {
  return (
    <Text style={[yazi.label, styles.etiket, { color: palet.yaziAna }]}>{metin}</Text>
  );
}

function AltEtiket({ metin, palet }: { metin: string; palet: Palet }) {
  return (
    <Text style={[yazi.data, styles.altEtiket, { color: palet.yaziSis }]}>{metin}</Text>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  icerik: { paddingBottom: s.s10 },
  baslikAlani: { paddingHorizontal: s.s4, paddingTop: s.s6, paddingBottom: s.s4 },
  altBaslik: { marginTop: s.s2 },
  bolum: { paddingHorizontal: s.s4, paddingVertical: s.s6 },
  etiket: { marginBottom: s.s4 },
  altEtiket: { marginBottom: s.s3 },
  anAlani: { marginBottom: s.s6 },
  kartlar: { flexDirection: "row", flexWrap: "wrap", gap: kart.aralik },
  sira: { flexDirection: "row", flexWrap: "wrap", gap: s.s3, alignItems: "center", marginBottom: s.s5 },
  tenteOrnek: { gap: s.s1 },
  cubukAlani: { maxWidth: 320, gap: s.s3 },
  isikSutunu: { gap: s.s1 },
});
