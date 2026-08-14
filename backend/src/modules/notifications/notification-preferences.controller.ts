import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { NotificationPreferencesService } from "./notification-preferences.service";

@Controller("me/notification-preferences")
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Actors("CONSUMER")
  @Get()
  get(@CurrentUser("id") userId: string) {
    return this.preferences.getOrCreate(userId);
  }

  @Actors("CONSUMER")
  @Patch()
  update(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferences.update(userId, dto);
  }
}
