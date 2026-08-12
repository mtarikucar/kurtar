import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { StoresService } from "./stores.service";

@Controller("stores")
@Actors("MERCHANT")
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Post()
  create(
    @CurrentUser("merchantId") merchantId: string,
    @Body() dto: CreateStoreDto,
  ) {
    return this.stores.create(merchantId, dto);
  }

  @Get()
  list(@CurrentUser("merchantId") merchantId: string) {
    return this.stores.list(merchantId);
  }

  @Get(":id")
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
