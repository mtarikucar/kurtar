import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { LoadingState } from "../components/LoadingState";
import { Screen } from "../components/Screen";

/**
 * The single entry gate: while the cold-start session bootstrap
 * (auth-context.tsx) is still resolving a persisted refresh token, show a
 * loading state rather than flashing the sign-in screen first. Once
 * resolved, hand off to the tabs (signed in) or the phone-entry screen
 * (signed out) — neither of those two route groups ever needs to think
 * about this decision themselves.
 */
export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (status === "signedIn") {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/phone" />;
}
