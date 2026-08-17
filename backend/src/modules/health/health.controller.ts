import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { HealthResponseDto } from "./dto/health-response.dto";

export interface HealthStatus {
  status: "ok";
  service: "kurtar-api";
  uptimeSec: number;
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  // Task 3 makes JwtAuthGuard global (every route requires auth by
  // default) — health must stay reachable by orchestration/monitoring
  // with no token.
  @ApiOperation({ summary: "Liveness probe. No auth required." })
  @ApiOkResponse({ type: HealthResponseDto })
  @Public()
  @Get()
  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "kurtar-api",
      uptimeSec: Math.floor(process.uptime()),
    };
  }
}
