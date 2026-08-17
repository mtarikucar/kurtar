import { Module } from "@nestjs/common";
import {
  MeImpactController,
  PublicImpactController,
} from "./impact.controller";
import { ImpactService } from "./impact.service";
import { ImpactCacheService } from "./impact-cache.service";

/**
 * ImpactLedgerHandler (impact-redeemed.handler.ts) is deliberately NOT
 * declared here, mirroring MembershipsModule's identical note on
 * MembershipApprovedHandler: it must be a provider of OutboxModule to
 * reach OutboxHandlerRegistry (not exported for other modules to inject),
 * so outbox.module.ts imports the class directly by file path even
 * though it lives under this folder. Its own constructor dependencies
 * (PrismaService, ConfigService) are both global providers, so this
 * module needn't export anything for it.
 */
@Module({
  controllers: [MeImpactController, PublicImpactController],
  providers: [ImpactService, ImpactCacheService],
})
export class ImpactModule {}
