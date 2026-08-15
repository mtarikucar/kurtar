import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { isApiError } from "../lib/apiError";
import { useAuth } from "./AuthContext";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await login(email, password);
    } catch (err) {
      // Login errors always branch on errorCode, never on message text
      // (brief rule). A 401 from POST /auth/admin/login has no declared
      // errorCode of its own (backend/src/modules/auth/auth.service.ts's
      // adminLogin() throws a bare UnauthorizedException("Invalid
      // credentials")) — @kurtar/api-client derives the fallback code
      // "UNAUTHORIZED" from Nest's default {statusCode, message, error}
      // shape (docs/frontend-contract.md §8's "derived-fallback family"),
      // which is exactly what a bad email/password OR an inactive admin
      // account both produce here.
      if (isApiError(err)) {
        if (err.isNetworkError) {
          setErrorMessage(t("login.networkError"));
        } else if (err.errorCode === "UNAUTHORIZED") {
          setErrorMessage(t("login.invalidCredentials"));
        } else {
          setErrorMessage(t("login.genericError"));
        }
      } else {
        setErrorMessage(t("login.genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>{t("login.title")}</h1>
        <p className={styles.subtitle}>{t("login.subtitle")}</p>

        {errorMessage ? (
          <div className={styles.error} role="alert">
            {errorMessage}
          </div>
        ) : null}

        <label className={styles.label} htmlFor="admin-email">
          {t("login.emailLabel")}
        </label>
        <input
          id="admin-email"
          className={styles.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />

        <label className={styles.label} htmlFor="admin-password">
          {t("login.passwordLabel")}
        </label>
        <input
          id="admin-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}
