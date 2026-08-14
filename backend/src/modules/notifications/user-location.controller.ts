import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { UserLocationService } from "./user-location.service";

// A device polling in the foreground could reasonably ping every few
// seconds while the app is open — tighter than the 300/min global default
// but loose enough not to fight normal foreground usage.
const LOCATION_UPDATE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller("me")
export class UserLocationController {
  constructor(private readonly userLocation: UserLocationService) {}

  @Actors("CONSUMER")
  @Throttle(LOCATION_UPDATE_THROTTLE)
  @Post("location")
  update(@CurrentUser("id") userId: string, @Body() dto: UpdateLocationDto) {
    return this.userLocation.update(userId, dto.lat, dto.lng);
  }
}
