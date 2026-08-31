import { ApiProperty } from "@nestjs/swagger";

/** [Contract completion] Mirrors HealthController's own HealthStatus
 * interface field-for-field — a separate class because @ApiOkResponse
 * needs a real class (with @ApiProperty-decorated members) to derive a
 * schema from, not a plain TS interface. */
export class HealthResponseDto {
  @ApiProperty({ enum: ["ok"] }) status!: "ok";
  @ApiProperty({ enum: ["kurtar-api"] }) service!: "kurtar-api";
  @ApiProperty() uptimeSec!: number;
}

/** What `/api/health/ready` answers: whether the API can actually serve a
 * request, dependency by dependency. */
export class ReadyResponseDto {
  @ApiProperty({ enum: ["ready", "degraded"] }) status!: "ready" | "degraded";
  @ApiProperty({ enum: ["up", "down"] }) database!: "up" | "down";
  @ApiProperty({ required: false }) detay?: string;
}
