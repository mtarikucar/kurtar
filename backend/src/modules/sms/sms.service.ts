import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SmsProvider,
  SmsSendResult,
} from "./sms-providers/sms-provider.interface";
import { NetGsmProvider } from "./sms-providers/netgsm.provider";
import { TwilioProvider } from "./sms-providers/twilio.provider";
import { MockSmsProvider } from "./sms-providers/mock.provider";
import { maskPhone } from "../../common/helpers/pii-mask.helper";

/**
 * SmsService — selects one SmsProvider via SMS_PROVIDER and sends through
 * it, with retry + non-retryable-error classification. Port of kds's
 * backend/src/modules/customers/sms.service.ts, adapted:
 *
 *  - Provider selection is EXPLICIT, not kds's auto-detect-with-silent-
 *    fallback. SMS_PROVIDER defaults to "mock" (kds instead falls back to
 *    an untyped mockMode when nothing is configured, which is how a config
 *    typo silently degrades to mock in kds). Naming an explicit
 *    netgsm/twilio provider whose credentials are incomplete is a hard
 *    boot-time error here, in every environment — the operator meant to
 *    wire a real provider and it isn't configured; fail loud, not quiet.
 *  - `SMS_PROVIDER=mock` (or unset, since mock is the default) REFUSES to
 *    boot in production — no escape hatch. A prod deploy with no SMS
 *    provider configured is a deploy that cannot actually deliver OTPs;
 *    refusing to boot is strictly better than silently mock-sending real
 *    customer verification codes into a log line.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;

  constructor(private configService: ConfigService) {
    this.provider = this.initializeProvider();
  }

  private initializeProvider(): SmsProvider {
    const providerName = (
      this.configService.get<string>("SMS_PROVIDER") || "mock"
    ).toLowerCase();
    const isProduction = process.env.NODE_ENV === "production";

    if (providerName === "mock") {
      if (isProduction) {
        throw new Error(
          "SMS_PROVIDER=mock (or unset) is not allowed in production. " +
            "Configure SMS_PROVIDER=netgsm (NETGSM_USERCODE/NETGSM_PASSWORD/" +
            "NETGSM_MSGHEADER) or SMS_PROVIDER=twilio (TWILIO_ACCOUNT_SID/" +
            "TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER).",
        );
      }
      this.logger.warn(
        "SMS_PROVIDER=mock — SMS will be logged, not delivered (NON-PRODUCTION ONLY)",
      );
      return new MockSmsProvider();
    }

    if (providerName === "netgsm") {
      const provider = new NetGsmProvider(
        this.configService.get<string>("NETGSM_USERCODE"),
        this.configService.get<string>("NETGSM_PASSWORD"),
        this.configService.get<string>("NETGSM_MSGHEADER"),
      );
      if (!provider.isConfigured()) {
        throw new Error(
          "SMS_PROVIDER=netgsm but NETGSM_USERCODE/NETGSM_PASSWORD/" +
            "NETGSM_MSGHEADER are not fully set.",
        );
      }
      return provider;
    }

    if (providerName === "twilio") {
      const provider = new TwilioProvider(
        this.configService.get<string>("TWILIO_ACCOUNT_SID"),
        this.configService.get<string>("TWILIO_AUTH_TOKEN"),
        this.configService.get<string>("TWILIO_PHONE_NUMBER"),
      );
      if (!provider.isConfigured()) {
        throw new Error(
          "SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/" +
            "TWILIO_PHONE_NUMBER are not fully set.",
        );
      }
      return provider;
    }

    throw new Error(
      `Unknown SMS_PROVIDER "${providerName}". Expected one of: mock, netgsm, twilio.`,
    );
  }

  /**
   * Send SMS with retry logic (exponential backoff: 1s, 2s, 4s) and
   * non-retryable-error short-circuiting.
   */
  async send(
    to: string,
    message: string,
    maxRetries = 3,
  ): Promise<SmsSendResult> {
    let lastError: Error | null = null;
    const masked = maskPhone(to);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.provider.send(to, message);

        if (!result.success && result.error?.startsWith("Non-retryable:")) {
          this.logger.error(
            `${this.provider.name} non-retryable error for ${masked}: ${result.error}`,
          );
          return result;
        }

        if (result.success) return result;

        lastError = new Error(result.error || "Unknown error");
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `SMS send attempt ${attempt}/${maxRetries} failed for ${masked} via ${this.provider.name}: ${lastError.message}`,
        );
      }

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.logger.error(
      `Failed to send SMS to ${masked} via ${this.provider.name} after ${maxRetries} attempts: ${lastError?.message}`,
    );

    return { success: false, error: lastError?.message || "Unknown error" };
  }

  /**
   * Send an OTP verification code SMS. Caller supplies the fully-formatted
   * message (OtpService owns the wording) so this stays a thin transport.
   */
  async sendVerificationCode(phone: string, message: string): Promise<boolean> {
    const result = await this.send(phone, message);
    return result.success;
  }

  async sendMessage(phone: string, message: string): Promise<boolean> {
    const result = await this.send(phone, message);
    return result.success;
  }

  /** True when the mock provider is active (no real delivery happens). */
  isMockMode(): boolean {
    return this.provider.name === "mock";
  }

  getProviderName(): string {
    return this.provider.name;
  }
}
