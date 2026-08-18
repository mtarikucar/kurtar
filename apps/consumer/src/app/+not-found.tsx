import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { EmptyState } from "../components/EmptyState";

/**
 * [M4 fix] expo-router's catch-all for any path that matches no route —
 * didn't exist before this fix, so an unmatched deep link (a malformed
 * share link, an old bookmark, a typo'd `kurtar://` URL) fell through to
 * expo-router's own unbranded default screen instead of this app's usual
 * empty-state look.
 */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="compass-outline"
        title={t("notFoundScreen.title")}
        body={t("notFoundScreen.body")}
        ctaLabel={t("notFoundScreen.cta")}
        onPressCta={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
