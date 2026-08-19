import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { HaritaSatiri } from "../../components/kesif/HaritaSatiri";
import { MapPane } from "../../components/MapPane";
import type { MapRegion } from "../../components/MapPane.types";
import { useSimdi } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
import { useDiscoveryMap, useDiscoveryOffers } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import { kalanDakika } from "../../components/kepenk";
import { acikMi } from "../../lib/kesif";
import type { DiscoveryMapPin } from "../../lib/api-types";
import type { LatLng } from "../../lib/location";

const KADIKOY: LatLng = { lat: 40.9903, lng: 29.03 };
/** Reaches across the Bosphorus to Beşiktaş — same radius as Keşfet
 * (index.tsx), for the same reason: the real seeded data spans both. */
const ARAMA_YARICAPI_M = 12_000;
const YAKINDAKI_ADET = 3;
const ALT_SAYFA_YUKSEKLIGI = 180;

/**
 * HARİTA — the dedicated full-screen map tab (spec §4.2).
 *
 * Full-screen, `PROVIDER_GOOGLE`, the dark Kadıköy style, price-chip
 * markers — all in `MapPane.native.tsx`. This screen supplies the data
 * and the bottom sheet: "the three nearest offers, sorted by closing
 * time, as 72pt compact rows."
 */
export default function HaritaEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const simdi = useSimdi();

  const { coords } = useEffectiveLocation();
  const konum = coords ?? KADIKOY;

  const [mapRegion, setMapRegion] = useState<MapRegion | null>(null);
  const [seciliPin, setSeciliPin] = useState<DiscoveryMapPin | null>(null);

  const initialRegion = useMemo<MapRegion>(() => {
    const delta = ARAMA_YARICAPI_M / 55_000;
    return {
      latitude: konum.lat,
      longitude: konum.lng,
      latitudeDelta: Math.max(delta, 0.01),
      longitudeDelta: Math.max(delta, 0.01),
    };
  }, [konum.lat, konum.lng]);

  const bbox = useMemo(() => {
    const bolge = mapRegion ?? initialRegion;
    return {
      west: bolge.longitude - bolge.longitudeDelta / 2,
      south: bolge.latitude - bolge.latitudeDelta / 2,
      east: bolge.longitude + bolge.longitudeDelta / 2,
      north: bolge.latitude + bolge.latitudeDelta / 2,
    };
  }, [mapRegion, initialRegion]);

  const mapQuery = useDiscoveryMap(bbox);
  const offersQuery = useDiscoveryOffers({
    lat: konum.lat,
    lng: konum.lng,
    radiusM: ARAMA_YARICAPI_M,
    pageSize: 40,
  });

  const yakindakiler = useMemo(() => {
    const teklifler = offersQuery.data?.items ?? [];
    return teklifler
      .filter((offer) => acikMi(offer, simdi))
      .sort(
        (a, b) =>
          kalanDakika(simdi, new Date(a.pickupEndAt)) -
          kalanDakika(simdi, new Date(b.pickupEndAt)),
      )
      .slice(0, YAKINDAKI_ADET);
  }, [offersQuery.data, simdi]);

  return (
    <Screen
      padded={false}
      edges={["top", "left", "right"]}
      // Same fix as Keşfet (index.tsx) — `Screen`'s own background is a
      // fixed light colour; this screen needs the phase's ground colour
      // underneath the full-screen map so a slow tile load or a narrow
      // safe-area sliver never shows a hardcoded-light seam in gece.
      style={{ backgroundColor: palet.bgAsfalt }}
    >
      <View style={styles.harita}>
        <MapPane
          pins={mapQuery.data ?? []}
          initialRegion={mapRegion ?? initialRegion}
          onRegionChangeComplete={setMapRegion}
          onPinPress={setSeciliPin}
          onSwitchToList={() => undefined}
          selectedStoreId={seciliPin?.storeId ?? null}
        />
      </View>

      {/* A painted panel over the map, not part of the ground: the label
          and the empty line inside it are card type, and the three rows
          below them are too. */}
      <View
        style={[
          styles.altSayfa,
          { backgroundColor: palet.yuzeyYukselti, borderTopColor: palet.bgDerin },
        ]}
      >
        <Text style={[yazi.label, styles.altBaslik, { color: palet.yaziSis }]}>
          {t("harita.yakinTeklifler")}
        </Text>
        {yakindakiler.length === 0 ? (
          <View style={styles.bosDurum}>
            <Text style={[yazi.body, { color: palet.yaziSis }]}>{t("harita.bosBaslik")}</Text>
          </View>
        ) : (
          yakindakiler.map((offer) => (
            <HaritaSatiri
              key={offer.offerId}
              dukkanId={offer.store.id}
              dukkanAdi={offer.store.name}
              fiyatKurus={offer.template.priceCents}
              kalanAdet={offer.qtyLeft}
              alisBaslangic={offer.pickupStartAt}
              alisBitis={offer.pickupEndAt}
              simdi={simdi}
              secili={offer.store.id === seciliPin?.storeId}
              onPress={() =>
                router.push({
                  pathname: "/offer/[id]",
                  params: {
                    id: offer.offerId,
                    storeId: offer.store.id,
                    distanceM: String(offer.store.distanceM),
                  },
                })
              }
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  harita: { flex: 1 },
  altSayfa: {
    height: ALT_SAYFA_YUKSEKLIGI,
    borderTopWidth: 1,
    paddingTop: s.s2,
    paddingHorizontal: s.s2,
  },
  altBaslik: { paddingHorizontal: s.s2, paddingBottom: s.s1 },
  bosDurum: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: r.card,
  },
});
