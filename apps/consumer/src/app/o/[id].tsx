import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { client } from "../../lib/api-client";

/**
 * [M4 fix] Landing side of the universal-link bridge (landing/app/
 * [locale]/o/[id]/page.tsx -> `kurtar://o/<id>` / the Android
 * `intent://o/<id>` scheme, OfferAppOpener.tsx) — this route did not
 * exist at all before this fix, so a device that opened the app via a
 * share link landed on expo-router's default unhandled-route behavior.
 *
 * Not a bare redirect to `/offer/[id]`: that screen requires BOTH `id`
 * AND `storeId` (its own `useStoreProfile(storeId)` call — see
 * offer/[id].tsx), and a share link only ever carries the offer id. This
 * resolves the storeId first via the same public, unauthenticated
 * `GET /discovery/offers/{id}` landing itself uses for the bridge page's
 * preview (packages/api-client/src/domains/discovery.ts's `offer`), then
 * replaces into the real offer screen with both params.
 */
export default function ShareLinkOfferScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    client.discovery.offer(id).then(
      (offer) => {
        if (cancelled) return;
        router.replace({
          pathname: "/offer/[id]",
          params: { id: offer.offerId, storeId: offer.store.id },
        });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (failed) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t("offerDetail.loadError")}
          ctaLabel={t("offerDetail.backToDiscover")}
          onPressCta={() => router.replace("/(tabs)")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <LoadingState />
    </Screen>
  );
}
