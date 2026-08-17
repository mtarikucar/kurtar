import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROUTES } from "../routes";
import { getErrorMessage } from "../shared/errors";
import {
  isValidEmail,
  isValidIban,
  isValidPassword,
  isValidTaxId,
} from "./validators";
import { Button } from "../shared/ui/Button";
import { TextField } from "../shared/ui/TextField";
import { Banner } from "../shared/ui/Banner";
import styles from "./AuthPages.module.css";

interface FormState {
  legalName: string;
  tradeName: string;
  taxId: string;
  iban: string;
  ownerName: string;
  email: string;
  password: string;
}

const EMPTY_FORM: FormState = {
  legalName: "",
  tradeName: "",
  taxId: "",
  iban: "",
  ownerName: "",
  email: "",
  password: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

/** Registration wizard — 3 short steps rather than one long form dump, per
 * the brief. Each step validates client-side (mirroring the server's own
 * taxId/IBAN rules — see validators.ts) before advancing, so a merchant
 * catches a typo immediately instead of after submitting. The server
 * remains the real gate: SIGNUP_INVALID_TAX_ID / _INVALID_IBAN /
 * MERCHANT_EMAIL_TAKEN are still handled on final submit. */
export function SignupPage() {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateBusinessStep(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.legalName.trim())
      errors.legalName = t("auth:signup.validation.required");
    if (!form.tradeName.trim())
      errors.tradeName = t("auth:signup.validation.required");
    if (!isValidTaxId(form.taxId.trim()))
      errors.taxId = t("auth:signup.validation.taxId");
    if (!isValidIban(form.iban.trim()))
      errors.iban = t("auth:signup.validation.iban");
    return errors;
  }

  function validateOwnerStep(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.ownerName.trim())
      errors.ownerName = t("auth:signup.validation.required");
    if (!isValidEmail(form.email.trim()))
      errors.email = t("auth:signup.validation.email");
    if (!isValidPassword(form.password))
      errors.password = t("auth:signup.validation.password");
    return errors;
  }

  function goNext(event: FormEvent) {
    event.preventDefault();
    const errors = step === 0 ? validateBusinessStep() : validateOwnerStep();
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setStep((s) => s + 1);
  }

  function goBack() {
    setSubmitError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await signup({
        legalName: form.legalName.trim(),
        tradeName: form.tradeName.trim(),
        taxId: form.taxId.trim(),
        iban: form.iban.trim().toUpperCase().replace(/\s+/g, ""),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate(ROUTES.onboarding, { replace: true });
    } catch (err) {
      setSubmitError(getErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  const totalSteps = 3;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("auth:signup.title")}</h1>
        <p className={styles.subtitle}>{t("auth:signup.subtitle")}</p>
      </div>

      <p className={styles.stepHeading}>
        {t("auth:signup.stepLabel", { current: step + 1, total: totalSteps })}
      </p>
      <p className={styles.stepTitle}>
        {t(
          `auth:signup.steps.${(["business", "owner", "review"] as const)[step]}`,
        )}
      </p>

      {step === 0 ? (
        <form className={styles.form} onSubmit={goNext} noValidate>
          <TextField
            label={t("auth:signup.fields.legalName")}
            required
            value={form.legalName}
            error={fieldErrors.legalName}
            onChange={(e) => setField("legalName", e.target.value)}
          />
          <TextField
            label={t("auth:signup.fields.tradeName")}
            required
            value={form.tradeName}
            error={fieldErrors.tradeName}
            onChange={(e) => setField("tradeName", e.target.value)}
          />
          <TextField
            label={t("auth:signup.fields.taxId")}
            hint={t("auth:signup.fields.taxIdHint")}
            required
            inputMode="numeric"
            value={form.taxId}
            error={fieldErrors.taxId}
            onChange={(e) =>
              setField("taxId", e.target.value.replace(/\D/g, ""))
            }
          />
          <TextField
            label={t("auth:signup.fields.iban")}
            hint={t("auth:signup.fields.ibanHint")}
            required
            value={form.iban}
            error={fieldErrors.iban}
            onChange={(e) => setField("iban", e.target.value.toUpperCase())}
          />
          <Button type="submit" size="large" fullWidth>
            {t("common:actions.next")}
          </Button>
        </form>
      ) : null}

      {step === 1 ? (
        <form className={styles.form} onSubmit={goNext} noValidate>
          <TextField
            label={t("auth:signup.fields.ownerName")}
            required
            value={form.ownerName}
            error={fieldErrors.ownerName}
            onChange={(e) => setField("ownerName", e.target.value)}
          />
          <TextField
            label={t("auth:signup.fields.email")}
            type="email"
            autoComplete="username"
            required
            value={form.email}
            error={fieldErrors.email}
            onChange={(e) => setField("email", e.target.value)}
          />
          <TextField
            label={t("auth:signup.fields.password")}
            hint={t("auth:signup.fields.passwordHint")}
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            error={fieldErrors.password}
            onChange={(e) => setField("password", e.target.value)}
          />
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={goBack}>
              {t("common:actions.back")}
            </Button>
            <Button type="submit" fullWidth>
              {t("common:actions.next")}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form
          className={styles.form}
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          {submitError ? <Banner tone="danger">{submitError}</Banner> : null}
          <div className={styles.reviewList}>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.legalName")}
              </span>
              <span>{form.legalName}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.tradeName")}
              </span>
              <span>{form.tradeName}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.taxId")}
              </span>
              <span>{form.taxId}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.iban")}
              </span>
              <span>{form.iban}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.ownerName")}
              </span>
              <span>{form.ownerName}</span>
            </div>
            <div className={styles.reviewItem}>
              <span className={styles.reviewLabel}>
                {t("auth:signup.fields.email")}
              </span>
              <span>{form.email}</span>
            </div>
          </div>
          <Banner tone="info">{t("auth:signup.reviewNote")}</Banner>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={goBack}
              disabled={submitting}
            >
              {t("common:actions.back")}
            </Button>
            <Button type="submit" fullWidth loading={submitting}>
              {submitting
                ? t("auth:signup.submitting")
                : t("auth:signup.submit")}
            </Button>
          </div>
        </form>
      ) : null}

      <p className={styles.footer}>
        {t("auth:signup.haveAccount")}{" "}
        <Link to={ROUTES.login}>{t("auth:signup.loginLink")}</Link>
      </p>
    </div>
  );
}
