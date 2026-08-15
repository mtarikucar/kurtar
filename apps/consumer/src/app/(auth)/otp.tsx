import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";
import { Screen } from "../../components/Screen";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useAuth } from "../../lib/auth-context";
import { classifyOtpRequestError, getErrorMessage } from "../../lib/errors";
import { KurtarApiError } from "@kurtar/api-client";

/**
 * Mirrors the backend's own fixed resend-cooldown constant
 * (backend/src/modules/otp/otp.service.ts's `OTP_RESEND_COOLDOWN_MS =
 * 60_000`) — this is what lets the screen show a REAL countdown instead of
 * a generic "please wait" (the task brief's explicit requirement). The
 * 24h failed-verification LOCKOUT, by contrast, has no client-knowable
 * deadline (its window is anchored dynamically — see otp.service.ts's
 * `windowAnchor`), so that branch deliberately does NOT show a fabricated
 * countdown, only an indeterminate "try again later" notice — see the
 * `lockedUntil` state below.
 */
const RESEND_COOLDOWN_SECONDS = 60;

export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { phone: phoneParam } = useLocalSearchParams<{ phone: string }>();
  const phone = phoneParam ?? "";
  const { verifyOtp, requestOtp } = useAuth();

  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const [locked, setLocked] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = (seconds: number) => {
    setLocked(false);
    setCooldownRemaining(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    startCooldown(RESEND_COOLDOWN_SECONDS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      await verifyOtp(phone, code);
      router.replace("/(auth)/permissions");
    } catch (err) {
      // otp.service.ts's verifyOtp() is DELIBERATELY uniform — wrong code,
      // expired code, already-consumed code, and a locked-out phone all
      // reject with the SAME plain 401 UnauthorizedException and no
      // errorCode ("no oracle": an attacker guessing codes learns nothing
      // from the response). Routing this through the generic
      // getErrorMessage() would fall into its statusCode===401 branch,
      // which says "your session expired, log in again" — misleading here
      // (the user has no prior session to have expired; they're mid-OTP
      // entry). A genuine network failure is still worth its own message;
      // every other case is the one honest, uniform "wrong or expired
      // code" copy.
      setVerifyError(
        err instanceof KurtarApiError && err.isNetworkError
          ? getErrorMessage(err, t)
          : t("auth.otp.invalid"),
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResendNotice(null);
    setVerifyError(null);
    setResending(true);
    try {
      await requestOtp(phone);
      setResendNotice(t("auth.otp.sent"));
      startCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const kind = classifyOtpRequestError(err);
      if (kind === "cooldown") {
        setResendNotice(t("auth.otp.cooldown"));
        startCooldown(RESEND_COOLDOWN_SECONDS); // resync — the server's own clock is authoritative
      } else if (kind === "lockout") {
        setResendNotice(t("auth.otp.lockout"));
        setLocked(true);
      } else if (kind === "throttled") {
        setResendNotice(t("auth.otp.throttled"));
        startCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setResendNotice(getErrorMessage(err, t));
      }
    } finally {
      setResending(false);
    }
  };

  const canResend = !locked && cooldownRemaining <= 0 && !resending;

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{t("auth.otp.title")}</Text>
        <Text style={styles.subtitle}>
          {t("auth.otp.subtitle", { phone })}
        </Text>

        <TextField
          label={t("auth.otp.title")}
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, "").slice(0, 6));
            if (verifyError) setVerifyError(null);
          }}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={6}
          error={verifyError ?? undefined}
          testID="otp-input"
        />

        <Button
          label={t("auth.otp.verify")}
          onPress={handleVerify}
          loading={verifying}
          disabled={code.length !== 6}
          testID="otp-verify"
        />

        {resendNotice ? <Text style={styles.notice}>{resendNotice}</Text> : null}

        <Button
          label={
            locked
              ? t("auth.otp.lockout")
              : canResend
                ? t("auth.otp.resend")
                : t("auth.otp.resendIn", { seconds: cooldownRemaining })
          }
          onPress={handleResend}
          variant="ghost"
          disabled={!canResend}
          loading={resending}
          testID="otp-resend"
        />

        <Button
          label={t("auth.otp.changeNumber")}
          onPress={() => router.back()}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  title: {
    fontSize: typeScale.h1.size,
    fontWeight: typeScale.h1.weight,
    color: colors.neutral[900],
  },
  subtitle: {
    fontSize: typeScale.body.size,
    color: colors.neutral[600],
  },
  notice: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.info[500],
    textAlign: "center",
  },
});
