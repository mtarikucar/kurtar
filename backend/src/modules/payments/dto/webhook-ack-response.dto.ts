import { ApiProperty } from "@nestjs/swagger";

/** [Contract completion] PaymentsWebhookController.handle — literal
 * `{received: true}` on EVERY path (verification failure, settle
 * failure, or success) by deliberate design — see the controller's own
 * doc comment on why this never returns anything else. */
export class WebhookAckResponseDto {
  @ApiProperty({ enum: [true] }) received!: true;
}
