import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { tenteDeseni } from "../../components/kepenk/tente-desen";
import { usePalet } from "../../design/theme";
import { m, r, s, yazi } from "../../design/tokens";
import { sayi } from "../../components/kepenk/olcum";
import { useFavorites } from "../../hooks/use-favorites";
import type { FavoriteListItem } from "../../lib/api-types";

const SERIT_GENISLIGI = 4;

/**
 * One favourited shop.
 *
 * The avatar was a fetched cover photo with a 🏬 emoji behind it, which
 * §5.15 forbids outright: "the hashed tente and the category glyph ARE
 * the identity system, and the moment one card has an image the whole
 * system reads as broken." So the row wears the shop's own awning stripe
 * down its left edge — the same 4pt strip, hashed from the same shop id,
 * that identifies it on the street and in Siparişler (§4.6). Moda Fırın
 * is the red-and-white one everywhere, and this list becomes scannable by
 * colour rather than by a logo nobody uploaded.
 */
function FavoriSatiri({ item, onPress }: { item: FavoriteListItem; onPress: () => void }) {
  const { t } = useTranslation();
  const palet = usePalet();
  const desen = tenteDeseni(item.storeId);
  const puanli = item.store.ratingCount > 0;

  const altSatir = puanli
    ? `${item.store.district} · ★ ${sayi(item.store.avgStars, 1)} · ${t("storeProfile.ratingCount", { count: item.store.ratingCount })}`
    : item.store.district;
  const durumMetni = item.hasLiveOfferToday
    ? t("favorites.hasOfferToday")
    : t("favorites.noOfferToday");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /**
       * A Pressable is `accessible` by default, so the shop's name alone
       * REPLACED the row's children rather than introducing them — and
       * the child it silenced was the badge this whole screen exists to
       * carry. Twelve favourites read as twelve names, and the one
       * question the list answers ("which of these has a bag tonight?")
       * could only be answered by opening all twelve.
       */
      accessibilityLabel={`${item.store.name}. ${altSatir}. ${durumMetni}`}
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
      <View style={[styles.serit, { backgroundColor: desen.bir }]} />
      <View style={styles.govde}>
        <Text
          style={[yazi.title, { color: palet.yaziAna }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {item.store.name}
        </Text>
        <Text
          style={[yazi.data, { color: palet.yaziSis }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {altSatir}
        </Text>
        {/* Under the name rather than beside it: "Bugün paketi var" is
            four words, and squeezed into the right-hand column it took
            the shop's own name down to an ellipsis. */}
        <View style={styles.durum}>
          <Badge label={durumMetni} ton={item.hasLiveOfferToday ? "sodyum" : "notr"} />
        </View>
      </View>
    </Pressable>
  );
}

export default function FavorilerEkrani() {
  const { t } = useTranslation();
  const router = useRouter();
  const palet = usePalet();
  const favorilerSorgusu = useFavorites();

  return (
    <Screen>
      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
        {t("favorites.title")}
      </Text>

      {favorilerSorgusu.isLoading ? (
        <LoadingState />
      ) : favorilerSorgusu.isError ? (
        <ErrorState onRetry={() => favorilerSorgusu.refetch()} />
      ) : (favorilerSorgusu.data?.items.length ?? 0) === 0 ? (
        // An empty screen is an invitation to act: this one used to
        // explain and then stop.
        <EmptyState
          icon="heart-outline"
          title={t("favorites.emptyTitle")}
          body={t("favorites.emptyBody")}
          ctaLabel={t("favorites.emptyCta")}
          onPressCta={() => router.push("/(tabs)")}
        />
      ) : (
        <FlatList
          data={favorilerSorgusu.data?.items ?? []}
          keyExtractor={(item) => item.storeId}
          contentContainerStyle={styles.listeIcerik}
          renderItem={({ item }) => (
            <FavoriSatiri
              item={item}
              onPress={() =>
                router.push({ pathname: "/store/[id]", params: { id: item.storeId } })
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  baslik: { marginBottom: s.s3 },
  listeIcerik: { gap: s.s2, paddingBottom: s.s10 },
  satir: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: r.card,
    overflow: "hidden",
    minHeight: 72,
    paddingRight: s.s3,
    elevation: 0,
  },
  serit: { width: SERIT_GENISLIGI, alignSelf: "stretch" },
  govde: { flex: 1, gap: 2, paddingVertical: s.s3, paddingLeft: s.s3, paddingRight: s.s2 },
  durum: { marginTop: s.s1 },
});
