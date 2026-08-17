import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import {
  GuestOnlyLayout,
  OnboardingLayout,
  RequireApprovedLayout,
} from "./auth/guards";
import { LoginPage } from "./auth/LoginPage";
import { SignupPage } from "./auth/SignupPage";
import { OnboardingPage } from "./onboarding/OnboardingPage";
import { AppShell } from "./layout/AppShell";
import { TodayPage } from "./today/TodayPage";
import { StoresPage } from "./stores/StoresPage";
import { CalendarPage } from "./calendar/CalendarPage";
import { EarningsPage } from "./earnings/EarningsPage";
import { ReputationPage } from "./reputation/ReputationPage";
import { Spinner } from "./shared/ui/Spinner";
import { useRouteFocus } from "./shared/useRouteFocus";
import { ROUTES } from "./routes";

/** "/" itself resolves to wherever the current session actually belongs —
 * every other route is reached through a real link/redirect, never "/". */
function RootRedirect() {
  const { status, merchant } = useAuth();
  if (status === "checking") return <Spinner />;
  if (status === "unauthenticated")
    return <Navigate to={ROUTES.login} replace />;
  if (merchant && merchant.verificationStatus !== "APPROVED") {
    return <Navigate to={ROUTES.onboarding} replace />;
  }
  return <Navigate to={ROUTES.today} replace />;
}

/** Split out from App() so useRouteFocus (which needs `useLocation`) runs
 * inside the <BrowserRouter> it depends on. */
function RoutedApp() {
  useRouteFocus();
  return (
    <Routes>
      <Route element={<GuestOnlyLayout />}>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.signup} element={<SignupPage />} />
      </Route>

      <Route element={<OnboardingLayout />}>
        <Route path={ROUTES.onboarding} element={<OnboardingPage />} />
      </Route>

      <Route element={<RequireApprovedLayout />}>
        <Route element={<AppShell />}>
          <Route path={ROUTES.today} element={<TodayPage />} />
          <Route path={ROUTES.stores} element={<StoresPage />} />
          <Route path={ROUTES.calendar} element={<CalendarPage />} />
          <Route path={ROUTES.earnings} element={<EarningsPage />} />
          <Route path={ROUTES.reputation} element={<ReputationPage />} />
        </Route>
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}
