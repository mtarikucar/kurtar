import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { Actors } from "../../auth/decorators/actors.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";
import { PushTokensService } from "./push-tokens.service";

@Controller("me/push-tokens")
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  @Actors("CONSUMER")
  @Post()
  register(
    @CurrentUser("id") userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushTokens.register(userId, dto.expoPushToken, dto.platform);
  }

  @Actors("CONSUMER")
  @Delete(":token")
  remove(@CurrentUser("id") userId: string, @Param("token") token: string) {
    return this.pushTokens.remove(userId, token);
  }
}
