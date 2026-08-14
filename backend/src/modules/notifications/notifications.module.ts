import { Module } from "@nestjs/common";
import { PushModule } from "./push/push.module";
import { EmailModule } from "./email/email.module";
import { NotificationPolicyModule } from "./notification-policy.module";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { UserLocationController } from "./user-location.controller";
import { UserLocationService } from "./user-location.service";

/**
 * Root notifications module — wires the consumer-facing "me" endpoints
 * (push-token lifecycle lives in PushModule's own controller;
 * notification-preferences + last-known-location live directly here) and
 * re-exports the push/email/policy building blocks OutboxModule's
 * handlers consume. modules/outbox imports PushModule/EmailModule
 * directly rather than through this module (see PushModule's own doc
 * comment on why NotificationPolicyModule is split out) — importing this
 * module too would work but isn't needed, so it doesn't.
 */
@Module({
  imports: [PushModule, EmailModule, NotificationPolicyModule],
  controllers: [NotificationPreferencesController, UserLocationController],
  providers: [NotificationPreferencesService, UserLocationService],
})
export class NotificationsModule {}
