import { Module } from "@nestjs/common";
import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
  controllers: [StoresController],
  providers: [StoresService],
  // [Task 9] modules/moderation injects StoresService for a content-
  // report "action" on a STORE target (adminDeactivate) — reused, not
  // duplicated.
  exports: [StoresService],
})
export class StoresModule {}
