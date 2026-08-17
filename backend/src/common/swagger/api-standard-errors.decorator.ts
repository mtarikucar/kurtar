import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { ErrorEnvelopeDto } from "./error-envelope.dto";

/**
 * The handful of error statuses nearly every authenticated, validated
 * route in this codebase can produce — bundled into ONE class-level
 * decorator so a controller sweep is "add this line" instead of
 * re-declaring the same four @ApiResponse calls per class. Route-specific
 * error codes (404 NOT_FOUND variants, 409 conflict variants) are still
 * documented per-route where they matter (see each controller's own
 * @ApiResponse calls); this decorator only covers the generic cross-
 * cutting ones every guard/pipe in the request pipeline can raise
 * (ValidationPipe -> 400, JwtAuthGuard -> 401, ActorsGuard/
 * MerchantApprovalGuard -> 403).
 */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: "Validation failed.",
      type: ErrorEnvelopeDto,
    }),
    ApiResponse({
      status: 401,
      description: "Missing or invalid access token.",
      type: ErrorEnvelopeDto,
    }),
    ApiResponse({
      status: 403,
      description:
        "Authenticated, but not permitted (wrong actor type, unapproved merchant, or ownership check failed).",
      type: ErrorEnvelopeDto,
    }),
  );
}
