import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";

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
