import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";

/**
 * [Fix round, Important 4] The 200 response for a streaming CSV export —
 * declared PER-ROUTE with an explicit `text/csv` content type, never via
 * class-level `@ApiProduces`. `@ApiProduces` sets the operation's content
 * type for EVERY declared response on that operation, including the
 * 400/401/403 ErrorEnvelopeDto responses `@ApiStandardErrors()` already
 * adds — which are genuinely `application/json` (Nest's global exception
 * filter never emits CSV), so a class-level `@ApiProduces("text/csv")`
 * made the generated spec claim JSON error bodies were CSV. Verified in
 * the generated document: before this fix, admin-exports' 400/401/403
 * responses rendered `content: {"text/csv": {schema: ErrorEnvelopeDto}}`
 * and the 200 had no content/schema at all.
 */
export function ApiCsvExportResponse(description: string) {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description,
      content: {
        "text/csv": {
          schema: { type: "string", format: "binary" },
        },
      },
    }),
  );
}
