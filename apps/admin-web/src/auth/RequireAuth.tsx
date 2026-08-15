import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Route guard: redirects to /login (preserving the attempted path) unless
 * the session-restore check on app boot has confirmed an authenticated
 * admin. While that check is in flight, renders a neutral loading state
 * rather than flashing the login form for a session that's about to
 * restore successfully. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation("auth");
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div role="status" aria-live="polite" style={{ padding: 32 }}>
        {t("session.restoring")}
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
