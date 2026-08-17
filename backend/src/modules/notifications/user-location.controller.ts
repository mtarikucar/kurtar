import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Actors } from "../auth/decorators/actors.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiStandardErrors } from "../../common/swagger/api-standard-errors.decorator";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { UserLocationService } from "./user-location.service";
import { UserLocationUpdateResponseDto } from "./dto/user-location-response.dto";

// A device polling in the foreground could reasonably ping every few
// seconds while the app is open — tighter than the 300/min global default
// but loose enough not to fight normal foreground usage.
const LOCATION_UPDATE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags("notifications")
@ApiBearerAuth()
@ApiStandardErrors()
@Controller("me")
export class UserLocationController {
  constructor(private readonly userLocation: UserLocationService) {}

  @ApiOperation({
    summary:
      "Report the caller's last-known device location (feeds the nearby-offer push fan-out).",
  })
  @ApiCreatedResponse({ type: UserLocationUpdateResponseDto })
  @Actors("CONSUMER")
  @Throttle(LOCATION_UPDATE_THROTTLE)
  @Post("location")
  update(@CurrentUser("id") userId: string, @Body() dto: UpdateLocationDto) {
    return this.userLocation.update(userId, dto.lat, dto.lng);
  }
}
