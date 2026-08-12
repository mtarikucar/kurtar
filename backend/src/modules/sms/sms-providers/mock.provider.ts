import { Logger } from "@nestjs/common";
import { SmsProvider, SmsSendResult } from "./sms-provider.interface";
import { maskPhone } from "../../../common/helpers/pii-mask.helper";

/**
 * Dev-only provider. SmsService selects this when SMS_PROVIDER=mock (the
 * default outside production) and REFUSES to boot with it in production —
 * see sms.service.ts. Unlike kds (which falls back to an inline "mockMode"
 * branch inside SmsService itself), kurtar makes mock a first-class
 * SmsProvider implementation so the selection logic in SmsService has a
 * single uniform code path for all three providers.
 *
 * Never throws, never fails: `send()` always succeeds and just logs the
 * message with the phone masked, so local development can verify the OTP
 * flow without a real provider. The OTP code itself stays visible in the
 * log line and is additionally echoed back to the caller by OtpService
 * (dev-only) — that's the intended local-dev use case.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  private readonly logger = new Logger(MockSmsProvider.name);

  isConfigured(): boolean {
    return true;
  }

  async send(to: string, message: string): Promise<SmsSendResult> {
    this.logger.log(`[MOCK SMS] To: ${maskPhone(to)}, Message: ${message}`);
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}
