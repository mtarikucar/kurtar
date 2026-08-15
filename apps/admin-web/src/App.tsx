import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./auth/LoginPage";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { MerchantsPage } from "./features/merchants/MerchantsPage";
import { ComplaintsListPage } from "./features/complaints/ComplaintsListPage";
import { ComplaintDetailPage } from "./features/complaints/ComplaintDetailPage";
import { ReportsPage } from "./features/moderation/ReportsPage";
import { SettlementsListPage } from "./features/settlements/SettlementsListPage";
import { SettlementDetailPage } from "./features/settlements/SettlementDetailPage";
import { PricingPage } from "./features/pricing/PricingPage";
import { RatingsPage } from "./features/ratings/RatingsPage";
import { ExportsPage } from "./features/exports/ExportsPage";
import "./i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Root app: providers (React Query, router, auth session) then routes.
 * Task 11's real admin panel — replaces Task 9.5's placeholder (which only
 * called `client.health.check()`; see docs/frontend-contract.md for what
 * that placeholder proved was already wired: cookie transport, workspace
 * imports, ui-tokens). Every screen below is a route under the
 * authenticated `AppLayout` shell except `/login`.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="merchants" element={<MerchantsPage />} />
              <Route path="complaints" element={<ComplaintsListPage />} />
              <Route path="complaints/:id" element={<ComplaintDetailPage />} />
              <Route path="moderation" element={<ReportsPage />} />
              <Route path="settlements" element={<SettlementsListPage />} />
              <Route
                path="settlements/:id"
                element={<SettlementDetailPage />}
              />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="ratings" element={<RatingsPage />} />
              <Route path="exports" element={<ExportsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
