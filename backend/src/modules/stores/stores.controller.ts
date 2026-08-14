import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { StoresService } from "./stores.service";

@Controller("stores")
@Actors("MERCHANT")
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  // create/update are writes that grow or reshape sellable surface — no
  // exemption; MerchantApprovalGuard requires APPROVED by default
  // (StoresService no longer duplicates this check itself — see its own
  // doc comment).
  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateStoreDto,
  ) {
    return this.stores.create(merchantId, dto);
  }

  // Reads: a merchant must still be able to see their own stores while
  // DRAFT (before ever being approved) or SUSPENDED (to understand what
  // got shut off).
  @Get()
  @AllowUnapprovedMerchant()
  list(@CurrentUser("merchantId") merchantId: string) {
    return this.stores.list(merchantId);
  }

  @Get(":id")
  @AllowUnapprovedMerchant()
  get(@CurrentUser("merchantId") merchantId: string, @Param("id") id: string) {
    return this.stores.get(merchantId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(merchantId, id, dto);
  }
}
