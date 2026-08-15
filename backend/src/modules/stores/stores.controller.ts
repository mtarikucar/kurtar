import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { StoresService } from "./stores.service";

@ApiTags("stores")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("stores")
@Actors("MERCHANT")
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  // create/update are writes that grow or reshape sellable surface — no
  // exemption; MerchantApprovalGuard requires APPROVED by default
  // (StoresService no longer duplicates this check itself — see its own
  // doc comment).
  @ApiOperation({
    summary: "Create a store for the calling (APPROVED) merchant.",
  })
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
  @ApiOperation({ summary: "List the calling merchant's own stores." })
  @Get()
  @AllowUnapprovedMerchant()
  list(@CurrentUser("merchantId") merchantId: string) {
    return this.stores.list(merchantId);
  }

  @ApiOperation({ summary: "Get one of the calling merchant's own stores." })
  @Get(":id")
  @AllowUnapprovedMerchant()
  get(@CurrentUser("merchantId") merchantId: string, @Param("id") id: string) {
    return this.stores.get(merchantId, id);
  }

  @ApiOperation({
    summary: "Update a store the calling (APPROVED) merchant owns.",
  })
  @Patch(":id")
  update(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(merchantId, id, dto);
  }
}
