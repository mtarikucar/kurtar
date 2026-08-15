import { ApiProperty } from "@nestjs/swagger";

/**
 * The uniform error shape every controller in this codebase throws
 * (`new XException({statusCode, errorCode, message})` — grep any error
 * factory function across modules/*.service.ts for the pattern). One
 * shared OpenAPI schema component (registered via
 * `@ApiExtraModels(ErrorEnvelopeDto)` in main.ts's DocumentBuilder setup)
 * that every controller's error responses reference, instead of each
 * route re-declaring its own ad-hoc error shape.
 */
export class ErrorEnvelopeDto {
  @ApiProperty({
    example: 400,
    description:
      "HTTP status code, duplicated from the response status for convenience.",
  })
  statusCode!: number;

  @ApiProperty({
    example: "VALIDATION_ERROR",
    description:
      "A stable, machine-readable identifier for this specific error condition — the field every client should branch on, never `message`.",
  })
  errorCode!: string;

  @ApiProperty({
    example: "overallStars must be between 1 and 5.",
    description:
      "Human-readable detail, Turkish or English depending on the request — not stable across releases, do not pattern-match on it.",
  })
  message!: string;
}
