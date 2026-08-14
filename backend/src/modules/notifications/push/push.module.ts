import { Module } from "@nestjs/common";
import { NotificationPolicyModule } from "../notification-policy.module";
import { PushProviderRegistry } from "./push-provider.registry";
import { PushFacadeService } from "./push-facade.service";
import { MockPushProvider } from "./adapters/mock-push-provider";
import { ExpoPushProvider } from "./adapters/expo-push-provider";
import { PushTokensController } from "./push-tokens.controller";
import { PushTokensService } from "./push-tokens.service";
import { PushDispatchService } from "./push-dispatch.service";

/**
 * The push seam (provider registry+facade+adapters, mirroring
 * modules/payments-core/) plus the token lifecycle endpoints and the
 * shared dispatch pipeline. Imports NotificationPolicyModule (not the root
 * NotificationsModule — see that module's own doc comment for why) for
 * PushDispatchService's policy dependency.
 */
@Module({
  imports: [NotificationPolicyModule],
  controllers: [PushTokensController],
  providers: [
    PushProviderRegistry,
    PushFacadeService,
    MockPushProvider,
    ExpoPushProvider,
    PushTokensService,
    PushDispatchService,
  ],
  exports: [PushFacadeService, PushDispatchService],
})
export class PushModule {}
