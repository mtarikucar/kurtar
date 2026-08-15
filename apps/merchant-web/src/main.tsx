import React from "react";
import ReactDOM from "react-dom/client";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import App from "./App";
import { AuthProvider, MERCHANT_ME_KEY } from "./auth/AuthContext";
import { isMerchantNotApproved } from "./shared/errors";
import { injectThemeVariables } from "./styles/theme";
import "./styles/global.css";
import "./i18n";

// Must run before the first render — every *.module.css file reads colors/
// spacing/type through the CSS custom properties this sets up from
// @kurtar/ui-tokens (see styles/theme.ts).
injectThemeVariables();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  // A merchant's verificationStatus can change WHILE they're mid-session
  // (an admin suspends them, say) — the router guard (auth/guards.tsx)
  // only re-evaluates it from the cached `["merchant","me"]` query, which
  // otherwise wouldn't refetch again until its staleTime lapses. Catching
  // MERCHANT_NOT_APPROVED here, globally, for every mutation in the app
  // means the very next gated action a no-longer-approved merchant
  // attempts re-syncs their real status and the guard redirects them to
  // onboarding on the next render — not just an error banner that leaves
  // them stuck on a screen they can no longer act on.
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isMerchantNotApproved(error)) {
        void queryClient.invalidateQueries({ queryKey: MERCHANT_ME_KEY });
      }
    },
  }),
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
