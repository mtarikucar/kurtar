import { Controller, Get, HttpCode } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { HealthResponseDto, ReadyResponseDto } from "./dto/health-response.dto";
import { PrismaService } from "../../prisma/prisma.service";

export interface HealthStatus {
  status: "ok";
  service: "kurtar-api";
  uptimeSec: number;
}

export interface ReadyStatus {
  status: "ready" | "degraded";
  database: "up" | "down";
  detay?: string;
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * READINESS, which is a different question from liveness and the one
   * a person actually means by "is it working?".
   *
   * `/api/health` answers "this process is running" and must keep
   * answering that even when the database is down — restarting the API
   * because Postgres is unreachable helps nobody, and an orchestrator
   * reading a dependency failure as a liveness failure would do exactly
   * that. But it means `/api/health` says `ok` on a machine where the
   * app cannot serve a single request, and the setup docs were pointing
   * newcomers at it as their "did it come up?" check.
   *
   * This endpoint answers the question they were really asking. It stays
   * HTTP 200 with a `degraded` body rather than throwing, so a caller
   * reads the reason instead of a bare 503.
   */
  @ApiOperation({
    summary: "Readiness probe: is the API able to serve? No auth required.",
  })
  @ApiOkResponse({ type: ReadyResponseDto })
  @Public()
  @HttpCode(200)
  @Get("ready")
  async getReady(): Promise<ReadyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "up" };
    } catch (err) {
      return {
        status: "degraded",
        database: "down",
        detay: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
