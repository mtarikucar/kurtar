import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { DistrictPicker } from "../../components/DistrictPicker";
import { VitrinKarti } from "../../components/kepenk";
import { Baslik } from "../../components/kesif/Baslik";
import { BolumBasligi } from "../../components/kesif/BolumBasligi";
import { BosSokak } from "../../components/kesif/BosSokak";
import { CiplerBar } from "../../components/kesif/CiplerBar";
import { KESIF_SAG_KENAR, KESIF_SOL_KENAR, kartGenisligiHesapla } from "../../components/kesif/duzen";
import { HaritaMini } from "../../components/kesif/HaritaMini";
import { HataSokagi } from "../../components/kesif/HataSokagi";
import { SokakSatiri } from "../../components/kesif/SokakSatiri";
import { SokakYukleniyor } from "../../components/kesif/SokakYukleniyor";
import { useIlkYuklemeKademesi } from "../../components/kesif/use-ilk-yukleme";
import type { MapRegion } from "../../components/MapPane.types";
import { useSimdi } from "../../design/saat";
import { usePalet, useTema } from "../../design/theme";
import { kart, s, yazi } from "../../design/tokens";
import { trUpper } from "../../design/tr-upper";
import { useDiscoveryMap, useDiscoveryOffers } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import type { DiscoveryMapPin, DiscoveryOfferItem } from "../../lib/api-types";
import { formatRemaining } from "../../lib/format";
import {
  BASLIK_ESIGI,
  HARITA_KAYDIRMA_ESIGI,
  acikMi,
  baskinBolge,
  eslesiyorMu,
  kategoriSorgusu,
  sokakListesi,
  sonrakiAcilisaMs,
  type KesifKategorisi,
  type KesifSatiri,
} from "../../lib/kesif";
import type { LatLng } from "../../lib/location";

/** Kadıköy — same coordinates as `design/faz.ts`'s `VARSAYILAN_KONUM`
 * (the app's default solar-phase location), used here as the discovery
 * search origin BEFORE any location signal (GPS or manual district)
 * exists, so the screen never blocks on a permission prompt (spec §4.8
 * LOCATION DENIED: "never a blocking wall"). */
const KADIKOY: LatLng = { lat: 40.9903, lng: 29.03 };
const KADIKOY_ADI = "Kadıköy";

/** No radius control on this screen — the finished spec's Keşfet has
 * category chips only, no diet/radius/pickup-time sheet (that UI belongs
 * to the earlier, replaced design; `FilterSheet` is untouched and still
 * serves Search, out of this track's scope). 12km reaches across the
 * Bosphorus to Beşiktaş — the real seeded data spans Kadıköy AND
 * Beşiktaş, which is exactly the cross-district case the street spine's
 * grouping exists to show. */
const ARAMA_YARICAPI_M = 12_000;

const BOLUM_SATIR_YUKSEKLIGI = 48;

export default function KesifEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { faz } = useTema();
  const simdi = useSimdi();
  const { width } = useWindowDimensions();

  const [kategori, setKategori] = useState<KesifKategorisi>("TUMU");
  const [bolgePickerAcik, setBolgePickerAcik] = useState(false);
  const [manuelBolgeAdi, setManuelBolgeAdi] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion | null>(null);
  const [seciliPin, setSeciliPin] = useState<DiscoveryMapPin | null>(null);

  const { coords: gercekKonum, denied: konumReddedildi, setManualLocation } =
    useEffectiveLocation();
  const aramaKonumu = gercekKonum ?? KADIKOY;

  const offersQuery = useDiscoveryOffers({
    lat: aramaKonumu.lat,
    lng: aramaKonumu.lng,
    radiusM: ARAMA_YARICAPI_M,
    category: kategoriSorgusu(kategori) ?? undefined,
    pageSize: 40,
  });

  const filtreliTeklifler = useMemo<DiscoveryOfferItem[]>(
    () => (offersQuery.data?.items ?? []).filter((offer) => eslesiyorMu(kategori, offer)),
    [offersQuery.data, kategori],
  );

  const satirlar = useMemo<KesifSatiri[]>(
    () => sokakListesi(filtreliTeklifler, simdi),
    [filtreliTeklifler, simdi],
  );

  const acikSayisi = useMemo(
    () => filtreliTeklifler.filter((offer) => acikMi(offer, simdi)).length,
    [filtreliTeklifler, simdi],
  );
  const baskinBolgeAdi = useMemo(
    () => baskinBolge(filtreliTeklifler, simdi),
    [filtreliTeklifler, simdi],
  );
  const basaligMetni =
    acikSayisi > BASLIK_ESIGI && baskinBolgeAdi
      ? t("kesif.acikCok", { bolge: baskinBolgeAdi, count: acikSayisi })
      : t("kesif.acikTekil", { count: acikSayisi });

  const ilkYukHazir = !offersQuery.isLoading && !offersQuery.isError;
  const gorunenSayi = useIlkYuklemeKademesi(satirlar.length, ilkYukHazir);
  const gorunenSatirlar = useMemo(
    () => (ilkYukHazir ? satirlar.slice(0, gorunenSayi) : []),
    [ilkYukHazir, satirlar, gorunenSayi],
  );

  const kartGenisligi = kartGenisligiHesapla(width);

  // --- The map (spec §4.1's collapsing header + §4.2's pins) ---
  const initialMapRegion = useMemo<MapRegion>(() => {
    const delta = ARAMA_YARICAPI_M / 55_000; // rough meters -> degrees at Istanbul's latitude
    return {
      latitude: aramaKonumu.lat,
      longitude: aramaKonumu.lng,
      latitudeDelta: Math.max(delta, 0.01),
      longitudeDelta: Math.max(delta, 0.01),
    };
  }, [aramaKonumu.lat, aramaKonumu.lng]);

  const bbox = useMemo(() => {
    const bolge = mapRegion ?? initialMapRegion;
    return {
      west: bolge.longitude - bolge.longitudeDelta / 2,
      south: bolge.latitude - bolge.latitudeDelta / 2,
      east: bolge.longitude + bolge.longitudeDelta / 2,
      north: bolge.latitude + bolge.latitudeDelta / 2,
    };
  }, [mapRegion, initialMapRegion]);

  const mapQuery = useDiscoveryMap(bbox, kategoriSorgusu(kategori) ?? undefined);

  const scrollY = useRef(new Animated.Value(0)).current;
  const listeRef = useRef<FlatList<KesifSatiri> | null>(null);
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
      }),
    [scrollY],
  );

  // --- The street spine's cumulative row offsets (fixed-height rows —
  // spec §3's card height never changes with width, only with font
  // scale, so this is stable across every card in a list). ---
  const satirYuksekligi = kart.yukseklik + kart.aralik;
  const duzen = useMemo(() => {
    let ofset = 0;
    return gorunenSatirlar.map((satir) => {
      const yukseklik = satir.tip === "bolum" ? BOLUM_SATIR_YUKSEKLIGI : satirYuksekligi;
      const kayit = { length: yukseklik, offset: ofset, index: 0 };
      ofset += yukseklik;
      return kayit;
    });
  }, [gorunenSatirlar, satirYuksekligi]);

  const handlePinPress = useCallback((pin: DiscoveryMapPin) => {
    setSeciliPin(pin);
    const index = satirlar.findIndex(
      (satir) => satir.tip === "teklif" && satir.teklif.dukkanId === pin.storeId,
    );
    if (index >= 0) {
      listeRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
    }
  }, [satirlar]);

  const handleCardPress = useCallback(
    (satir: Extract<KesifSatiri, { tip: "teklif" }>) => {
      const eslesenPin = mapQuery.data?.find((p) => p.storeId === satir.teklif.dukkanId);
      if (eslesenPin) setSeciliPin(eslesenPin);
      router.push({
        pathname: "/offer/[id]",
        params: {
          id: satir.teklif.teklifId,
          storeId: satir.teklif.dukkanId,
          distanceM: String(satir.teklif.mesafeM),
        },
      });
    },
    [mapQuery.data, router],
  );

  const bosMu = ilkYukHazir && filtreliTeklifler.length === 0;
  const bosTuru = kategori !== "TUMU" ? "filtreli" : faz === "gece" ? "gece" : "gunduz";
  const gorunenBolgeAdi = manuelBolgeAdi ?? (gercekKonum ? baskinBolgeAdi : null) ?? KADIKOY_ADI;

  return (
    <Screen
      padded={false}
      edges={["top", "left", "right"]}
      // `Screen`'s own background is a fixed light `neutral[50]` — right
      // for every OTHER route, but this one screen lives under the
      // day/night phase system (spec §1.1) and must show the phase's own
      // ground colour, not a hardcoded light one. Invisible in gündüz,
      // where the two happen to be close; a stark light band behind the
      // header and the empty/loading text in gece, where they are not —
      // found by actually looking at the night frames (see build log).
      style={{ backgroundColor: palet.bgAsfalt }}
    >
      <Baslik bolgeAdi={gorunenBolgeAdi} onBolgeDegistir={() => setBolgePickerAcik(true)} />

      <HaritaMini
        scrollY={scrollY}
        pins={mapQuery.data ?? []}
        initialRegion={mapRegion ?? initialMapRegion}
        onRegionChangeComplete={setMapRegion}
        onPinPress={handlePinPress}
        onSwitchToList={() =>
          listeRef.current?.scrollToOffset({ offset: HARITA_KAYDIRMA_ESIGI + 40, animated: true })
        }
        selectedStoreId={seciliPin?.storeId ?? null}
      />

      {konumReddedildi ? (
        <View style={[styles.konumBanner, { borderColor: palet.cizgiKil }]}>
          <Text style={[yazi.data, styles.konumMetni, { color: palet.yaziSis }]}>
            {t("kesif.konumKapali", { bolge: KADIKOY_ADI })}
          </Text>
          <Pressable
            onPress={() => Linking.openSettings().catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel={t("kesif.konumAc")}
            hitSlop={8}
          >
            <Text style={[yazi.label, { color: palet.sodyumYazi }]}>{t("kesif.konumAc")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.ustBilgi}>
        <Text style={[yazi.data, { color: palet.yaziSis }]} maxFontSizeMultiplier={1.3}>
          {basaligMetni}
        </Text>
      </View>

      <View style={styles.ciplerSarici}>
        <CiplerBar secili={kategori} onSec={setKategori} />
      </View>

      {offersQuery.isError ? (
        <ScrollView style={styles.doluAlan} contentContainerStyle={styles.doluAlanIcerik}>
          <HataSokagi kartGenisligi={kartGenisligi} onTekrarDene={() => offersQuery.refetch()} />
        </ScrollView>
      ) : !ilkYukHazir ? (
        <ScrollView style={styles.doluAlan} contentContainerStyle={styles.doluAlanIcerik}>
          <SokakYukleniyor kartGenisligi={kartGenisligi} />
        </ScrollView>
      ) : bosMu ? (
        <ScrollView style={styles.doluAlan} contentContainerStyle={styles.doluAlanIcerik}>
          <BosSokak
            tur={bosTuru}
            kartGenisligi={kartGenisligi}
            geriSayimMetni={
              bosTuru === "gece" ? formatRemaining(sonrakiAcilisaMs(simdi)) : undefined
            }
            onFiltreleriTemizle={() => setKategori("TUMU")}
          />
        </ScrollView>
      ) : (
        <Animated.FlatList
          ref={listeRef as never}
          testID="kesif-liste"
          style={styles.doluAlan}
          data={gorunenSatirlar}
          keyExtractor={(item: KesifSatiri) => item.anahtar}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.liste}
          getItemLayout={(_data, index) => ({ ...duzen[index]!, index })}
          renderItem={({ item }: { item: KesifSatiri }) =>
            item.tip === "bolum" ? (
              <BolumBasligi
                baslik={item.tur === "bolge" ? trUpper(item.bolge) : t("kesif.kacirdiklarin")}
              />
            ) : (
              <SokakSatiri mesafeM={item.teklif.mesafeM}>
                <VitrinKarti
                  teklif={item.teklif}
                  genislik={kartGenisligi}
                  onPress={() => handleCardPress(item)}
                />
              </SokakSatiri>
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={offersQuery.isRefetching}
              onRefresh={() => offersQuery.refetch()}
              tintColor={palet.sodyumDolgu}
            />
          }
        />
      )}

      <DistrictPicker
        visible={bolgePickerAcik}
        onSelect={(coords, name) => {
          setManualLocation(coords);
          setManuelBolgeAdi(name);
          setBolgePickerAcik(false);
        }}
        onClose={() => setBolgePickerAcik(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ustBilgi: { paddingHorizontal: s.s4, paddingTop: s.s3, paddingBottom: s.s1 },
  ciplerSarici: { paddingVertical: s.s2 },
  doluAlan: { flex: 1 },
  doluAlanIcerik: { flexGrow: 1, paddingBottom: s.s10 },
  // Asymmetric on purpose: the spine reads as the street's own left edge
  // (see duzen.ts), so the list's left inset is the spine's, not another
  // s4 gutter on top of it — the right edge keeps s4 so it still lines up
  // with the header and the filter chips above.
  liste: {
    paddingLeft: KESIF_SOL_KENAR,
    paddingRight: KESIF_SAG_KENAR,
    paddingBottom: s.s10,
  },
  konumBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: s.s3,
    marginHorizontal: s.s4,
    marginTop: s.s2,
    paddingVertical: s.s2,
    paddingHorizontal: s.s3,
    borderWidth: 1,
    borderRadius: 6,
  },
  konumMetni: { flex: 1 },
});
