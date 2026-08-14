import { Module } from "@nestjs/common";
import { NotificationPolicyService } from "./notification-policy.service";

/**
 * Small standalone module for NotificationPolicyService, split out from
 * the root NotificationsModule so PushModule can import it without a
 * module-level cycle (NotificationsModule imports PushModule; PushModule's
 * PushDispatchService needs NotificationPolicyService). PrismaService is
 * @Global, so no other import is needed here.
 */
@Module({
  providers: [NotificationPolicyService],
  exports: [NotificationPolicyService],
})
export class NotificationPolicyModule {}
