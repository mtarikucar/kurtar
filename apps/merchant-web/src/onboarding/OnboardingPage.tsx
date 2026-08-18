import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { client } from "../api/client";
import { getErrorMessage } from "../shared/errors";
import { legalDocumentUrl } from "../shared/externalLinks";
import { Button } from "../shared/ui/Button";
import { Checkbox } from "../shared/ui/Checkbox";
import { TextField } from "../shared/ui/TextField";
import { Banner } from "../shared/ui/Banner";
import { Card } from "../shared/ui/Card";
import styles from "./OnboardingPage.module.css";

/**
 * [I11 fix] The intermediation contract's own version label — was a
 * hand-typed, unrelated identifier ("2026-08") stamped alongside
 * `sttAttestationAccepted`/`intermediationAccepted` as the platform's ONLY
 * record of what the merchant actually attested to, while the published
 * document (landing/content/legal/aracilik-sozlesmesi.ts) stamps a
 * completely different string. Sourced from that document's own
 * `versionLabel.tr` so the two can never drift silently — bump this
 * constant only when that file's versionLabel changes.
 */
const CONTRACT_VERSION = "v0.1 — 15 Ağustos 2026";

/** Guided onboarding for DRAFT/SUBMITTED/UNDER_REVIEW/REJECTED/SUSPENDED
 * merchants (see auth/guards.tsx's OnboardingLayout — an APPROVED merchant
 * never sees this page). Explains what's missing, what's next, and what
 * happens after — never a bare form, per the brief. */
export function OnboardingPage() {
  const { t } = useTranslation(["onboarding", "common"]);
  const { merchant, logout, refreshMerchant } = useAuth();

  const [sttAccepted, setSttAccepted] = useState(false);
  const [intermediationAccepted, setIntermediationAccepted] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const trimmedNotes = notes.trim();
      return client.merchant.submitForReview({
        sttAttestationAccepted: sttAccepted,
        intermediationAccepted,
        intermediationContractVersion: CONTRACT_VERSION,
        // MerchantSubmitDto.docsJson is a free-form object server-side
        // (`@IsObject()`, no fixed shape — this task's brief has no file
        // upload, so it's a metadata note); the generated client type
        // collapses an untyped object schema to `Record<string, never>`,
        // which cannot structurally describe an arbitrary object literal —
        // see api/response-types.ts's file doc comment for the same
        // generated-client staleness this cast works around.
        ...(trimmedNotes
          ? {
              docsJson: { notes: trimmedNotes } as unknown as Record<
                string,
                never
              >,
            }
          : {}),
      });
    },
    onSuccess: async () => {
      setError(null);
      await refreshMerchant();
    },
    onError: (err) => setError(getErrorMessage(err, t)),
  });

  if (!merchant) return null;

  const status = merchant.verificationStatus;

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void logout()}
        >
          {t("onboarding:logout")}
        </button>
      </div>

      <h1 className={styles.title}>{t("onboarding:title")}</h1>

      {status === "DRAFT" ? (
        <Banner tone="warning" heading={t("onboarding:draft.heading")}>
          {t("onboarding:draft.body")}
        </Banner>
      ) : null}
      {status === "SUBMITTED" ? (
        <Banner tone="info" heading={t("onboarding:submitted.heading")}>
          <p>{t("onboarding:submitted.body")}</p>
          <p>{t("onboarding:submitted.eta")}</p>
        </Banner>
      ) : null}
      {status === "UNDER_REVIEW" ? (
        <Banner tone="info" heading={t("onboarding:underReview.heading")}>
          {t("onboarding:underReview.body")}
        </Banner>
      ) : null}
      {status === "REJECTED" ? (
        <Banner tone="danger" heading={t("onboarding:rejected.heading")}>
          {t("onboarding:rejected.body")}
        </Banner>
      ) : null}
      {status === "SUSPENDED" ? (
        <Banner tone="danger" heading={t("onboarding:suspended.heading")}>
          {t("onboarding:suspended.body")}
        </Banner>
      ) : null}

      <Card className={styles.checklist}>
        <span className={styles.checklistHeading}>
          {t("onboarding:checklist.heading")}
        </span>
        <div className={styles.checklistItems}>
          <div className={styles.checklistItem}>
            <span className={styles.checklistBadge}>1</span>
            {t("onboarding:checklist.store")}
          </div>
          <div className={styles.checklistItem}>
            <span className={styles.checklistBadge}>2</span>
            {t("onboarding:checklist.template")}
          </div>
          <div className={styles.checklistItem}>
            <span className={styles.checklistBadge}>3</span>
            {t("onboarding:checklist.publish")}
          </div>
        </div>
      </Card>

      {status === "DRAFT" ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submitMutation.mutate();
          }}
        >
          <h2>{t("onboarding:attestation.heading")}</h2>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Checkbox
            label={
              <Trans
                i18nKey="onboarding:attestation.stt"
                components={{
                  legal: (
                    <a
                      href={legalDocumentUrl("aracilik-sozlesmesi")}
                      target="_blank"
                      rel="noreferrer"
                    />
                  ),
                }}
              />
            }
            checked={sttAccepted}
            onChange={(e) => setSttAccepted(e.target.checked)}
            required
          />
          <Checkbox
            label={
              <Trans
                i18nKey="onboarding:attestation.intermediation"
                components={{
                  legal: (
                    <a
                      href={legalDocumentUrl("aracilik-sozlesmesi")}
                      target="_blank"
                      rel="noreferrer"
                    />
                  ),
                }}
              />
            }
            checked={intermediationAccepted}
            onChange={(e) => setIntermediationAccepted(e.target.checked)}
            required
          />
          <span className={styles.contractVersion}>
            {t("onboarding:attestation.contractVersion")}: {CONTRACT_VERSION}
          </span>
          <TextField
            label={t("onboarding:attestation.notesLabel")}
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            type="submit"
            size="large"
            fullWidth
            loading={submitMutation.isPending}
            disabled={!sttAccepted || !intermediationAccepted}
          >
            {submitMutation.isPending
              ? t("onboarding:attestation.submitting")
              : t("onboarding:attestation.submit")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
