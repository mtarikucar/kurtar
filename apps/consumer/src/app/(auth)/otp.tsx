import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/Screen";
import { GirisCephesi } from "../../components/GirisCephesi";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { usePalet } from "../../design/theme";
import { r, s, yazi } from "../../design/tokens";
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
  const palet = usePalet();
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
      <ScrollView
        contentContainerStyle={styles.icerik}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <GirisCephesi />

        <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>
          {t("auth.otp.title")}
        </Text>
        <Text style={[yazi.body, { color: palet.yaziSisZemin }]}>
          {t("auth.otp.subtitle", { phone })}
        </Text>

        <View style={styles.form}>
          {/* The six digits are set in the same mono face, at the same
              tracking, as the four the merchant reads off the redeem
              screen — a code is a fact from a machine either way, and the
              two screens are the only places in the app where digits are
              the whole content. */}
          <TextField
            label={t("auth.otp.title")}
            etiketGizli
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
            style={styles.kodGirisi}
            testID="otp-input"
          />

          <Button
            label={t("auth.otp.verify")}
            onPress={handleVerify}
            loading={verifying}
            disabled={code.length !== 6}
            testID="otp-verify"
          />
        </View>

        {/* A resend notice is information, not an alarm — so it is a
            note on the card surface rather than a red fill, which this
            app reserves for the thing that is actually running out. The
            wrong-code case is the alarm, and it lives on the field. */}
        {resendNotice ? (
          <View style={[styles.not, { backgroundColor: palet.yuzeyKaldirim }]}>
            <Text
              style={[yazi.data, styles.notYazisi, { color: palet.yaziSis }]}
              maxFontSizeMultiplier={1.3}
            >
              {resendNotice}
            </Text>
          </View>
        ) : null}

        <View style={styles.ikincilEylemler}>
          <Button
            label={
              locked
                ? t("auth.otp.lockout")
                : canResend
                  ? t("auth.otp.resend")
                  : t("auth.otp.resendIn", { seconds: cooldownRemaining })
            }
            onPress={handleResend}
            varyant="hayalet"
            disabled={!canResend}
            loading={resending}
            testID="otp-resend"
          />

          <Button
            label={t("auth.otp.changeNumber")}
            onPress={() => router.back()}
            varyant="hayalet"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icerik: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: s.s6,
    gap: s.s3,
  },
  baslik: { marginTop: s.s5 },
  form: { marginTop: s.s3, gap: s.s4 },
  kodGirisi: {
    fontFamily: "ChivoMono_700Bold",
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: 8,
    textAlign: "center",
  },
  not: {
    alignSelf: "center",
    borderRadius: r.plaque,
    paddingHorizontal: s.s3,
    paddingVertical: s.s2,
  },
  notYazisi: { textAlign: "center" },
  ikincilEylemler: { marginTop: s.s2, gap: s.s2 },
});
