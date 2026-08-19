import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { PALETLER, s, yazi, type Faz } from "../design/tokens";
import { SeninSokagin } from "../components/sokak/SeninSokagin";
import type { KurtarmaKaydi } from "../components/sokak/sokak-hesap";

/**
 * A review-only harness for SENİN SOKAĞIN (spec §4.7) — the same purpose
 * /vitrin serves for the offer card: the seeded demo data gives any one
 * consumer at most one or two rescues, which says nothing about whether
 * many storefronts across many months read as a STREET or degrade into a
 * bar chart. This fixture spans four months, six shops, and repeat
 * visits up to and past the taller/brighter cap, in all three palette
 * phases. Not linked from anywhere in the app; open it at
 * /sokak-inceleme.
 */

const FAZLAR: readonly Faz[] = ["gece", "alacakaranlik", "gunduz"];
const FAZ_ADI: Readonly<Record<Faz, string>> = {
  gece: "GECE",
  alacakaranlik: "ALACAKARANLIK",
  gunduz: "GÜNDÜZ",
};

const DUKKANLAR = {
  modaFirin: "review-moda-firin",
  yeldegirmeni: "review-yeldegirmeni-pastanesi",
  caferaga: "review-caferaga-kahve",
  manavAli: "review-manav-ali-usta",
  besiktasKafe: "review-besiktas-kafe",
  kadikoyMarket: "review-kadikoy-market",
} as const;

const DUKKAN_ADLARI: Record<string, string> = {
  [DUKKANLAR.modaFirin]: "Moda Fırın",
  [DUKKANLAR.yeldegirmeni]: "Yeldeğirmeni Pastanesi",
  [DUKKANLAR.caferaga]: "Caferağa Kahve Evi",
  [DUKKANLAR.manavAli]: "Manav Ali Usta",
  [DUKKANLAR.besiktasKafe]: "Beşiktaş Kafe",
  [DUKKANLAR.kadikoyMarket]: "Kadıköy Market",
};

function kayit(reservationId: string, storeId: string, iso: string): KurtarmaKaydi {
  return { reservationId, storeId, redeemedAt: new Date(iso) };
}

/** Four months, six shops. Moda Fırın (5×) and Yeldeğirmeni (3×) exercise
 * the taller/brighter repeat-visit scale; the rest are single visits, so
 * the street reads as a real mix of regulars and one-offs rather than a
 * uniform row. */
const ZENGIN_KAYITLAR: readonly KurtarmaKaydi[] = [
  // Mayıs 2026
  kayit("r1", DUKKANLAR.modaFirin, "2026-05-03T18:10:00.000Z"),
  kayit("r2", DUKKANLAR.kadikoyMarket, "2026-05-14T17:40:00.000Z"),
  // Haziran 2026
  kayit("r3", DUKKANLAR.modaFirin, "2026-06-02T18:20:00.000Z"),
  kayit("r4", DUKKANLAR.yeldegirmeni, "2026-06-05T19:05:00.000Z"),
  kayit("r5", DUKKANLAR.besiktasKafe, "2026-06-19T17:55:00.000Z"),
  kayit("r6", DUKKANLAR.manavAli, "2026-06-27T18:45:00.000Z"),
  // Temmuz 2026
  kayit("r7", DUKKANLAR.modaFirin, "2026-07-01T18:15:00.000Z"),
  kayit("r8", DUKKANLAR.yeldegirmeni, "2026-07-08T19:10:00.000Z"),
  kayit("r9", DUKKANLAR.caferaga, "2026-07-11T18:00:00.000Z"),
  kayit("r10", DUKKANLAR.modaFirin, "2026-07-20T18:25:00.000Z"),
  kayit("r11", DUKKANLAR.kadikoyMarket, "2026-07-26T17:50:00.000Z"),
  // Ağustos 2026
  kayit("r12", DUKKANLAR.modaFirin, "2026-08-02T18:05:00.000Z"),
  kayit("r13", DUKKANLAR.yeldegirmeni, "2026-08-06T19:00:00.000Z"),
  kayit("r14", DUKKANLAR.besiktasKafe, "2026-08-10T18:10:00.000Z"),
  kayit("r15", DUKKANLAR.modaFirin, "2026-08-14T18:30:00.000Z"),
  kayit("r16", DUKKANLAR.caferaga, "2026-08-17T18:00:00.000Z"),
  kayit("r17", DUKKANLAR.manavAli, "2026-08-19T17:20:00.000Z"),
];

const TEK_KAYIT: readonly KurtarmaKaydi[] = [
  kayit("tek-1", DUKKANLAR.caferaga, "2026-08-01T18:45:00.000Z"),
];

export default function SokakIncelemeEkrani() {
  const gece = PALETLER.gece;

  return (
    <SafeAreaView style={[styles.kok, { backgroundColor: gece.bgAsfalt }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.icerik}>
        <Text style={[yazi.tabelaLg, { color: gece.yaziAna }]}>SENİN SOKAĞIN — İNCELEME</Text>
        <Text style={[yazi.data, styles.altBaslik, { color: gece.yaziSis }]}>
          17 kurtarma · 6 dükkân · 4 ay · üç palet — gerçek şikayet
          verisinin veremediği çeşitlilik
        </Text>

        {FAZLAR.map((faz) => (
          <View key={faz} style={styles.fazBlok}>
            <Text style={[yazi.label, { color: gece.yaziSis }]}>{FAZ_ADI[faz]}</Text>
            <ClockProvider sabitZaman={new Date("2026-08-19T18:00:00.000Z")}>
              <ThemeProvider fazZorla={faz}>
                <View
                  style={[
                    styles.kart,
                    { backgroundColor: PALETLER[faz].bgAsfalt, borderColor: PALETLER[faz].cizgiKil },
                  ]}
                >
                  <SeninSokagin
                    kayitlar={ZENGIN_KAYITLAR}
                    dukkanAdi={(id) => DUKKAN_ADLARI[id] ?? null}
                  />
                </View>
              </ThemeProvider>
            </ClockProvider>
          </View>
        ))}

        <Text style={[yazi.label, styles.altBaslik, { color: gece.yaziSis, marginTop: s.s8 }]}>
          TEK KURTARMA — İLK GÜN
        </Text>
        <ClockProvider sabitZaman={new Date("2026-08-19T18:00:00.000Z")}>
          <ThemeProvider fazZorla="gece">
            <View style={[styles.kart, { backgroundColor: gece.bgAsfalt, borderColor: gece.cizgiKil }]}>
              <SeninSokagin
                kayitlar={TEK_KAYIT}
                dukkanAdi={(id) => DUKKAN_ADLARI[id] ?? null}
              />
            </View>
          </ThemeProvider>
        </ClockProvider>

        <Text style={[yazi.label, styles.altBaslik, { color: gece.yaziSis, marginTop: s.s8 }]}>
          BOŞ SOKAK — HİÇ KURTARMA YOK
        </Text>
        <ClockProvider sabitZaman={new Date("2026-08-19T18:00:00.000Z")}>
          <ThemeProvider fazZorla="gece">
            <View style={[styles.kart, { backgroundColor: gece.bgAsfalt, borderColor: gece.cizgiKil }]}>
              <SeninSokagin kayitlar={[]} dukkanAdi={() => null} />
            </View>
          </ThemeProvider>
        </ClockProvider>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
  icerik: { padding: s.s4, gap: s.s3, paddingBottom: s.s10 * 2 },
  altBaslik: { marginBottom: s.s2 },
  fazBlok: { gap: s.s2 },
  kart: {
    paddingVertical: s.s2,
  },
});
