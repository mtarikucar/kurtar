import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Actors } from "../../auth/decorators/actors.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../../common/swagger/api-standard-errors.decorator";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";
import { PushTokensService } from "./push-tokens.service";

@ApiTags("notifications")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("me/push-tokens")
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  @ApiOperation({
    summary: "Register (upsert) an Expo push token for the caller's device.",
  })
  @Actors("CONSUMER")
  @Post()
  register(
    @CurrentUser("id") userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushTokens.register(userId, dto.expoPushToken, dto.platform);
  }

  @ApiOperation({ summary: "Remove one of the caller's own push tokens." })
  @Actors("CONSUMER")
  @Delete(":token")
  remove(@CurrentUser("id") userId: string, @Param("token") token: string) {
    return this.pushTokens.remove(userId, token);
  }
}
