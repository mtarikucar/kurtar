import { Module } from "@nestjs/common";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { DiscoveryCacheService } from "./discovery-cache.service";

@Module({
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryCacheService],
})
export class DiscoveryModule {}
