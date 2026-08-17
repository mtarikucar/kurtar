import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationPreferenceDto } from "./dto/notification-preference-response.dto";

@ApiTags("notifications")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("me/notification-preferences")
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @ApiOperation({
    summary:
      "Get the caller's own notification preferences (created with defaults on first read).",
  })
  @ApiOkResponse({ type: NotificationPreferenceDto })
  @Actors("CONSUMER")
  @Get()
  get(@CurrentUser("id") userId: string) {
    return this.preferences.getOrCreate(userId);
  }

  @ApiOperation({
    summary: "Update the caller's own notification preferences.",
  })
  @ApiOkResponse({ type: NotificationPreferenceDto })
  @Actors("CONSUMER")
  @Patch()
  update(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferences.update(userId, dto);
  }
}
