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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { AllowUnapprovedMerchant } from "../auth/decorators/allow-unapproved-merchant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { BagTemplatesService } from "./bag-templates.service";
import { CreateBagTemplateDto } from "./dto/create-bag-template.dto";
import { ListBagTemplatesQueryDto } from "./dto/list-bag-templates-query.dto";
import { UpdateBagTemplateDto } from "./dto/update-bag-template.dto";
import { BagTemplateDto } from "./dto/bag-template-response.dto";

@ApiTags("offers")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("bag-templates")
@Actors("MERCHANT")
export class BagTemplatesController {
  constructor(private readonly bagTemplates: BagTemplatesService) {}

  // Writes (create/update/deactivate) require APPROVED by default —
  // MerchantApprovalGuard (modules/auth/guards/merchant-approval.guard.ts).
  @ApiOperation({
    summary:
      "Create a bag template (the reusable listing template offers are created from).",
  })
  @ApiCreatedResponse({ type: BagTemplateDto })
  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateBagTemplateDto,
  ) {
    return this.bagTemplates.create(merchantId, dto);
  }

  // Reads stay available regardless of status — same reasoning as
  // StoresController's list/get.
  @ApiOperation({ summary: "List the calling merchant's own bag templates." })
  @ApiOkResponse({ type: BagTemplateDto, isArray: true })
  @Get()
  @AllowUnapprovedMerchant()
  list(
    @CurrentUser("merchantId") merchantId: string,
    @Query() query: ListBagTemplatesQueryDto,
  ) {
    return this.bagTemplates.list(merchantId, query.storeId);
  }

  @ApiOperation({
    summary: "Get one of the calling merchant's own bag templates.",
  })
  @ApiOkResponse({ type: BagTemplateDto })
  @Get(":id")
  @AllowUnapprovedMerchant()
  get(@CurrentUser("merchantId") merchantId: string, @Param("id") id: string) {
    return this.bagTemplates.get(merchantId, id);
  }

  @ApiOperation({ summary: "Update a bag template." })
  @ApiOkResponse({ type: BagTemplateDto })
  @Patch(":id")
  update(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateBagTemplateDto,
  ) {
    return this.bagTemplates.update(merchantId, id, dto);
  }

  @ApiOperation({
    summary: "Deactivate a bag template (existing offers unaffected).",
  })
  @ApiOkResponse({ type: BagTemplateDto })
  @Delete(":id")
  deactivate(
    @CurrentUser("merchantId") merchantId: string,
    @Param("id") id: string,
  ) {
    return this.bagTemplates.deactivate(merchantId, id);
  }
}
