import { Controller, Get } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
  service: "kurtar-api";
  uptimeSec: number;
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "kurtar-api",
      uptimeSec: Math.floor(process.uptime()),
    };
  }
}
