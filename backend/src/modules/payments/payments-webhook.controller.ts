import {
  Controller,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentsFacadeService } from "../payments-core/payments-facade.service";
import { PaymentSettleService } from "./payment-settle.service";

/**
 * Inbound payment provider callback. @Public (JwtAuthGuard would reject
 * it outright — the provider never carries a kurtar bearer token) but
 * still verified: PaymentsFacadeService.parseWebhook() is the
 * verification step (mock checks a shared-secret header; a real provider
 * would check an HMAC signature), and it throws for anything that
 * doesn't verify.
 *
 * Contract, mirroring kds's webhook controller convention
 * (backend/src/modules/payments/webhooks/paytr-webhook.controller.ts):
 * ALWAYS return 200 + an ACK body, whatever happened inside, including an
 * unrecognized merchantOid or a settlement error — a non-2xx here just
 * trains the provider to retry-storm us, and every failure mode is
 * already logged (parseWebhook's own UnauthorizedException; the settle
 * service's "unknown_merchant_oid" / "amount_mismatch" outcomes and their
 * own log lines).
 */
@ApiTags("payments")
@Controller("webhooks/payment")
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly facade: PaymentsFacadeService,
    private readonly settle: PaymentSettleService,
  ) {}

  @ApiOperation({
    summary:
      "Payment provider webhook callback. No bearer auth — verified by a provider-specific signature/shared-secret instead (see PaymentsFacadeService.parseWebhook). Always returns 200.",
  })
  @Public()
  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    // req.rawBody is populated by NestFactory.create(AppModule, { rawBody:
    // true }) in main.ts. The fallback re-serializes the already-parsed
    // JSON body — only exercised if rawBody capture is ever disabled; the
    // mock provider's shared-secret check doesn't depend on byte-exact
    // raw bytes, but a future HMAC-based provider would.
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    let event;
    try {
      event = await this.facade.parseWebhook(rawBody, req.headers);
    } catch (err) {
      this.logger.warn(
        `Webhook verification failed: ${(err as Error).message}`,
      );
      return { received: true };
    }

    try {
      await this.settle.settle(event);
    } catch (err) {
      this.logger.error(
        `Webhook settle threw for merchantOid=${event.merchantOid}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { received: true };
  }
}
