import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { DistrictPicker } from "../../components/DistrictPicker";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { VitrinKarti } from "../../components/kepenk";
import { CiplerBar } from "../../components/kesif/CiplerBar";
import { usePalet } from "../../design/theme";
import { kart, s, yazi } from "../../design/tokens";
import { useDiscoveryOffers } from "../../hooks/use-discovery";
import { useEffectiveLocation } from "../../hooks/use-effective-location";
import {
  eslesiyorMu,
  kategoriSorgusu,
  teklifeCevir,
  type KesifKategorisi,
} from "../../lib/kesif";

/** Wide enough to reach the other side of the Bosphorus: Ara is the one
 * screen where a user is looking for a NAME rather than for whatever is
 * nearest, so it must not silently drop a shop they can name. */
const ARAMA_YARICAPI_M = 20_000;

/** The same floor `kesif/duzen.ts` holds the street's cards to, so a very
 * narrow device never crushes the tabela below its own type floor. */
const EN_DAR_KART = 280;

/**
 * ARA — search.
 *
 * The chips here are the discovery screen's chips, the same component
 * with the same six categories and the same `kategoriSorgusu` /
 * `eslesiyorMu` query mapping — not a second category vocabulary. The
 * screen used to carry its own row naming the API's five raw
 * `BagCategory` values (Yemek / Fırın / Market / Manav / Diğer), so a
 * user tapping "Fırın" on Keşfet and "Fırın" on Ara was choosing from two
 * different sets on two adjacent tabs.
 *
 * Results are the same storefront card the street shows, so a shop found
 * by name looks like the shop found by walking.
 */
export default function AramaEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const { width } = useWindowDimensions();

  const [sorgu, setSorgu] = useState("");
  const [kategori, setKategori] = useState<KesifKategorisi>("TUMU");
  const [bolgePickerAcik, setBolgePickerAcik] = useState(false);
  const { coords, denied, setManualLocation } = useEffectiveLocation();

  const aramaVar = sorgu.trim().length > 0 || kategori !== "TUMU";
  const apiKategorisi = kategoriSorgusu(kategori);

  const teklifSorgusu = useDiscoveryOffers(
    coords && aramaVar
      ? {
          lat: coords.lat,
          lng: coords.lng,
          radiusM: ARAMA_YARICAPI_M,
          category: apiKategorisi ?? undefined,
          q: sorgu.trim().length > 0 ? sorgu.trim() : undefined,
          pageSize: 30,
        }
      : null,
  );

  // The fırın/pastane split is client-side by construction — the backend
  // calls both BAKERY (see lib/kesif.ts) — so it is applied here exactly
  // as the street applies it.
  const sonuclar = useMemo(
    () => (teklifSorgusu.data?.items ?? []).filter((teklif) => eslesiyorMu(kategori, teklif)),
    [teklifSorgusu.data, kategori],
  );

  // Floored, not just capped: on a cold web load the window reports 0 on
  // the first paint, and a card built from `width - gutters` would hand
  // its SVG children a negative width, which RNSVG rejects outright.
  const kartGenisligi = Math.max(
    EN_DAR_KART,
    Math.min(kart.genislik, Math.round(width - 2 * s.s5)),
  );

  return (
    <Screen padded={false}>
      <View style={styles.ustBolum}>
        <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
          {t("tabs.search")}
        </Text>

        {/* One string, one job: the placeholder says what to type, so the
            label is carried for the screen reader alone. */}
        <TextField
          label={t("search.placeholder")}
          etiketGizli
          placeholder={t("search.placeholder")}
          value={sorgu}
          onChangeText={setSorgu}
          returnKeyType="search"
          testID="arama-girisi"
        />
      </View>

      <View style={styles.cipler}>
        <CiplerBar secili={kategori} onSec={setKategori} />
      </View>

      {denied ? (
        <View style={styles.bolgeSecici}>
          <Button
            label={t("discover.chooseDistrict")}
            varyant="ikincil"
            onPress={() => setBolgePickerAcik(true)}
          />
        </View>
      ) : null}

      <View style={styles.sonuclar}>
        {!aramaVar ? (
          <EmptyState
            icon="search-outline"
            title={t("search.prompt")}
            body={t("search.promptBody")}
          />
        ) : !coords || teklifSorgusu.isLoading ? (
          <LoadingState />
        ) : teklifSorgusu.isError ? (
          <ErrorState onRetry={() => teklifSorgusu.refetch()} />
        ) : sonuclar.length === 0 ? (
          <EmptyState
            icon="sad-outline"
            title={t("search.emptyTitle")}
            body={
              sorgu.trim().length > 0
                ? t("search.emptyBody", { query: sorgu.trim() })
                : t("search.emptyKategoriBody")
            }
            ctaLabel={t("search.emptyCta")}
            onPressCta={() => router.push("/(tabs)")}
          />
        ) : (
          <FlatList
            data={sonuclar}
            keyExtractor={(item) => item.offerId}
            contentContainerStyle={styles.listeIcerik}
            renderItem={({ item }) => (
              <VitrinKarti
                teklif={teklifeCevir(item)}
                genislik={kartGenisligi}
                onPress={() =>
                  router.push({
                    pathname: "/offer/[id]",
                    params: {
                      id: item.offerId,
                      storeId: item.store.id,
                      distanceM: String(item.store.distanceM),
                    },
                  })
                }
              />
            )}
          />
        )}
      </View>

      <DistrictPicker
        visible={bolgePickerAcik}
        onSelect={(secilen) => {
          setManualLocation(secilen);
          setBolgePickerAcik(false);
        }}
        onClose={() => setBolgePickerAcik(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ustBolum: { paddingHorizontal: s.s5, gap: s.s3 },
  baslik: { marginBottom: s.s1 },
  cipler: { marginTop: s.s4 },
  bolgeSecici: { paddingHorizontal: s.s5, marginTop: s.s3 },
  sonuclar: { flex: 1, marginTop: s.s4 },
  listeIcerik: {
    paddingHorizontal: s.s5,
    gap: kart.aralik,
    paddingBottom: s.s10,
  },
});
