import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROUTES } from "../routes";
import { getErrorMessage } from "../shared/errors";
import { Button } from "../shared/ui/Button";
import { TextField } from "../shared/ui/TextField";
import { Banner } from "../shared/ui/Banner";
import styles from "./AuthPages.module.css";

export function LoginPage() {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const merchant = await login(email, password);
      navigate(
        merchant.verificationStatus === "APPROVED"
          ? ROUTES.today
          : ROUTES.onboarding,
        {
          replace: true,
        },
      );
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("auth:login.title")}</h1>
        <p className={styles.subtitle}>{t("auth:login.subtitle")}</p>
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <TextField
          label={t("auth:login.emailLabel")}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t("auth:login.passwordLabel")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="large" fullWidth loading={submitting}>
          {submitting ? t("auth:login.submitting") : t("auth:login.submit")}
        </Button>
      </form>
      <p className={styles.footer}>
        {t("auth:login.noAccount")}{" "}
        <Link to={ROUTES.signup}>{t("auth:login.signupLink")}</Link>
      </p>
    </div>
  );
}
