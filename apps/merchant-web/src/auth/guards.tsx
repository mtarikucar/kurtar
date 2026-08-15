import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROUTES } from "../routes";
import { Spinner } from "../shared/ui/Spinner";

/**
 * Router-level approval gate — the brief's "a SUBMITTED/DRAFT merchant
 * must not be able to reach store/offer screens; the UI should never let
 * them hit [MERCHANT_NOT_APPROVED] blind" requirement. Every screen that
 * needs an APPROVED merchant nests under this layout route instead of each
 * page re-deriving the check itself, so there is exactly one place that can
 * get it wrong.
 */
export function RequireApprovedLayout() {
  const { status, merchant } = useAuth();

  if (status === "checking") return <Spinner />;
  if (status === "unauthenticated")
    return <Navigate to={ROUTES.login} replace />;
  if (merchant && merchant.verificationStatus !== "APPROVED") {
    return <Navigate to={ROUTES.onboarding} replace />;
  }
  return <Outlet />;
}

/** /baslangic — only for a logged-in, not-yet-APPROVED merchant. An already
 * approved merchant has nothing to do here. */
export function OnboardingLayout() {
  const { status, merchant } = useAuth();

  if (status === "checking") return <Spinner />;
  if (status === "unauthenticated")
    return <Navigate to={ROUTES.login} replace />;
  if (merchant && merchant.verificationStatus === "APPROVED") {
    return <Navigate to={ROUTES.today} replace />;
  }
  return <Outlet />;
}

/** /giris, /kayit — a session that's already resolved sends the merchant
 * straight to the right place instead of showing them a login form again. */
export function GuestOnlyLayout() {
  const { status, merchant } = useAuth();

  if (status === "checking") return <Spinner />;
  if (status === "authenticated" && merchant) {
    return (
      <Navigate
        to={
          merchant.verificationStatus === "APPROVED"
            ? ROUTES.today
            : ROUTES.onboarding
        }
        replace
      />
    );
  }
  return <Outlet />;
}
