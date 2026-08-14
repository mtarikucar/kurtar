import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BagTemplatesService } from "./bag-templates.service";
import { CreateBagTemplateDto } from "./dto/create-bag-template.dto";
import { ListBagTemplatesQueryDto } from "./dto/list-bag-templates-query.dto";
import { UpdateBagTemplateDto } from "./dto/update-bag-template.dto";

@Controller("bag-templates")
@Actors("MERCHANT")
export class BagTemplatesController {
  constructor(private readonly bagTemplates: BagTemplatesService) {}

  // Writes (create/update/deactivate) require APPROVED by default —
  // MerchantApprovalGuard (modules/auth/guards/merchant-approval.guard.ts).
  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateBagTemplateDto,
  ) {
    return this.bagTemplates.create(merchantId, dto);
  }

  // Reads stay available regardless of status — same reasoning as
  // StoresController's list/get.
  @Get()
  @AllowUnapprovedMerchant()
  list(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListBagTemplatesQueryDto,
  ) {
    return this.bagTemplates.list(merchantId, query.storeId);
  }

  @Get(":id")
  @AllowUnapprovedMerchant()
  get(@CurrentUser("merchantId") merchantId: string, @Param("id") id: string) {
    return this.bagTemplates.get(merchantId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateBagTemplateDto,
  ) {
    return this.bagTemplates.update(merchantId, id, dto);
  }

  @Delete(":id")
  deactivate(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.bagTemplates.deactivate(merchantId, id);
  }
}
