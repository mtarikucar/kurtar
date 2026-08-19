import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { IconButton } from "../../components/IconButton";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Cephe } from "../../components/Cephe";
import { ZamanHapi } from "../../components/kepenk/ZamanHapi";
import { saatBulunma } from "../../components/kepenk/tr-saat";
import {
  degerBandiMetni,
  fiyatMetni,
  kalanDakika,
  sayi,
  teklifDurumu,
} from "../../components/kepenk/olcum";
import { useReduceMotion } from "../../design/reduce-motion";
import { useSimdi } from "../../design/saat";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi } from "../../design/tokens";
import { useStoreProfile } from "../../hooks/use-discovery";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import type { DiscoveryTodaysOffer } from "../../lib/api-types";
import { formatClockTime, formatPickupWindow } from "../../lib/format";

/**
 * DÜKKÂN — the shop's own page.
 *
 * It opened with a fetched 160pt cover photograph, with a 🏬 emoji tile
 * behind it when there was none. §5.15 is unambiguous: there is no
 * photography in this app, and "the moment one card has an image the
 * whole system reads as broken." The hero is therefore the shop's own
 * identity — its hashed awning and its painted sign, the same two objects
 * that name it on the street, in Siparişler and in Favoriler.
 *
 * The sign is LIT when the shop has something on sale today and dark
 * when it has nothing left, which is the one honest thing a shop page can
 * say about the day. There is no shutter here: the kepenk is a clock for
 * ONE offer's closing time (§2), and a shop is not an offer — the rows
 * below carry each offer's own window.
 */
export default function DukkanEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const simdi = useSimdi();
  const azaltHareket = useReduceMotion();
  const { id } = useLocalSearchParams<{ id: string }>();

  const storeQuery = useStoreProfile(id ?? null);
  const favoritesQuery = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const isFavorite = favoritesQuery.data?.items.some((f) => f.storeId === id) ?? false;
  const teklifler = useMemo(
    () => storeQuery.data?.todaysOffers ?? [],
    [storeQuery.data],
  );
  /**
   * The lamp is on when the shop has something to sell today — open now
   * OR not open yet — and off only when there is nothing, or nothing
   * left. Tying it to "open THIS minute" made every shop page dark
   * before 19:00, and `plakaYaziSonuk` is ivory at 22%: the one thing a
   * shop page must always say clearly is which shop it is.
   */
  const yanik = useMemo(
    () =>
      teklifler.some(
        (teklif) =>
          teklifDurumu(
            teklif.qtyLeft,
            new Date(teklif.pickupStartAt),
            new Date(teklif.pickupEndAt),
            simdi,
          ) !== "tukendi",
      ),
    [teklifler, simdi],
  );

  return (
    <Screen padded={false}>
      <View style={styles.baslikSatiri}>
        <IconButton
          name="chevron-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <View style={styles.baslikEylemleri}>
          <IconButton
            name="flag-outline"
            accessibilityLabel={t("report.title.STORE")}
            testID="store-report-cta"
            onPress={() =>
              id &&
              router.push({
                pathname: "/report/new",
                params: { targetType: "STORE", targetId: id },
              })
            }
          />
          <IconButton
            name={isFavorite ? "heart" : "heart-outline"}
            yanik={isFavorite}
            accessibilityLabel={
              isFavorite ? t("storeProfile.unfavoriteCta") : t("storeProfile.favoriteCta")
            }
            testID="favorite-toggle"
            onPress={() => id && toggleFavorite.mutate({ storeId: id, isFavorite })}
          />
        </View>
      </View>

      {storeQuery.isLoading ? (
        <LoadingState />
      ) : storeQuery.isError || !storeQuery.data ? (
        <ErrorState onRetry={() => storeQuery.refetch()} />
      ) : (
        <FlatList
          data={teklifler}
          keyExtractor={(item) => item.offerId}
          contentContainerStyle={styles.listeIcerik}
          ListHeaderComponent={
            <View>
              <Cephe
                dukkanId={storeQuery.data.store.id}
                ad={storeQuery.data.store.name}
                yanik={yanik}
                kepenkli={false}
                testIDOneki="dukkan"
              />
              <View style={styles.cepheMeta}>
                <Text
                  style={[yazi.data, { color: palet.yaziSisZemin }]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.3}
                >
                  {`${storeQuery.data.store.address}, ${storeQuery.data.store.district}`}
                </Text>
                <Text
                  style={[yazi.data, { color: palet.yaziAnaZemin }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {storeQuery.data.rating.count > 0
                    ? `★ ${sayi(storeQuery.data.rating.average, 1)} · ${t("storeProfile.ratingCount", { count: storeQuery.data.rating.count })}`
                    : t("offerDetail.noRatingYet")}
                </Text>
              </View>

              <Text style={[yazi.label, styles.bolumBasligi, { color: palet.yaziSisZemin }]}>
                {t("storeProfile.todaysOffers")}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState icon="cafe-outline" title={t("storeProfile.noOffersToday")} />
          }
          renderItem={({ item }) => (
            <TeklifSatiri
              teklif={item}
              simdi={simdi}
              azaltHareket={azaltHareket}
              onPress={() =>
                router.push({
                  pathname: "/offer/[id]",
                  params: { id: item.offerId, storeId: id },
                })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

/**
 * A compact offer row — §4.2's 72pt sheet row, which is the object this
 * app already uses when the shop is known and only the package is not:
 * name, window, price, and the same time pill the card wears.
 *
 * No struck-through original price. The bag's contents are a range and
 * there is no single "was" price to strike; inventing one is a lie and
 * printing it beside the range that contradicts it makes the user
 * reconcile two numbers to answer one question (§5.8). This row used to
 * print `₺180–300` with a line through it.
 */
function TeklifSatiri({
  teklif,
  simdi,
  azaltHareket,
  onPress,
}: {
  teklif: DiscoveryTodaysOffer;
  simdi: Date;
  azaltHareket: boolean | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const palet = usePalet();
  const baslangic = new Date(teklif.pickupStartAt);
  const bitis = new Date(teklif.pickupEndAt);
  const durum = teklifDurumu(teklif.qtyLeft, baslangic, bitis, simdi);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={teklif.template.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.satir,
        {
          backgroundColor: palet.yuzeyKaldirim,
          borderColor: palet.kartCizgi,
          borderWidth: palet.kartCizgiKalinlik,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderTopColor: palet.kartUstIsik,
          borderBottomColor: palet.kartAltTemas,
        },
        pressed ? { opacity: m.pressOpacity } : null,
      ]}
    >
      <View style={styles.satirGovdesi}>
        <Text
          style={[yazi.paket, { color: palet.yaziAna }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {teklif.template.title}
        </Text>
        <Text
          style={[yazi.data, { color: palet.yaziSis }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {formatPickupWindow(teklif.pickupStartAt, teklif.pickupEndAt)}
        </Text>
      </View>

      <View style={styles.fiyatSutunu}>
        <Text
          style={[yazi.priceLg, { color: palet.sodyumYazi }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {fiyatMetni(teklif.template.priceCents)}
        </Text>
        <Text
          style={[yazi.data, styles.bant, { color: palet.yaziSis }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {t("vitrin.degerBandi", {
            band: degerBandiMetni(
              teklif.template.originalValueCentsMin,
              teklif.template.originalValueCentsMax,
            ),
          })}
        </Text>
        {durum === "tukendi" ? null : (
          <View style={styles.hapAlani}>
            <ZamanHapi
              durum={durum}
              kalanDk={kalanDakika(simdi, bitis)}
              acilisSaati={saatBulunma(formatClockTime(baslangic))}
              palet={palet}
              azaltHareket={azaltHareket}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  baslikSatiri: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: s.s2,
    paddingVertical: s.s1,
  },
  baslikEylemleri: { flexDirection: "row", alignItems: "center" },
  listeIcerik: {
    paddingHorizontal: s.s5,
    paddingBottom: s.s10,
    gap: s.s2,
  },
  cepheMeta: { marginTop: s.s3, gap: 2 },
  bolumBasligi: { marginTop: s.s6, marginBottom: s.s2 },
  satir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: r.card,
    padding: s.s3,
    gap: s.s3,
    elevation: 0,
  },
  satirGovdesi: { flex: 1, gap: 2 },
  fiyatSutunu: { alignItems: "flex-end", gap: 2 },
  bant: { textAlign: "right" },
  hapAlani: { marginTop: s.s1 },
});
