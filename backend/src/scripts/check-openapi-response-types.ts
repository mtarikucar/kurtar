import * as fs from "fs";
import * as path from "path";

/**
 * `npm run openapi:check-response-types` — a standalone check against the
 * COMMITTED docs/openapi.json (no Nest boot, no database; just reads the
 * file), added after the "80% of operations have no response schema"
 * finding that blocked Task 9.5's frontend scaffold. Two invariants,
 * enforced for every GET/POST/PUT/PATCH/DELETE operation:
 *
 *   1. Exactly ONE 2xx response entry. More than one is the exact
 *      "phantom status" class a prior review caught on POST
 *      /api/complaints (an @ApiOkResponse describing a 200 the route
 *      never actually sends, alongside the real bare 201) — a typed
 *      client would look for the body under the wrong status and find
 *      nothing under the one the server actually uses. Zero would mean
 *      the operation never documents success at all.
 *   2. That one 2xx entry has a REAL schema — `content` present, with a
 *      media type whose `schema` is neither absent nor one of the two
 *      "technically present but says nothing" shapes NestJS's swagger
 *      plugin emits when no explicit @ApiOkResponse/@ApiCreatedResponse
 *      exists: a bare `{"type":"object"}` (untyped single object) or
 *      `{"type":"array","items":{"type":"object"}}` (untyped array) — the
 *      exact form `admin.pricing.list` silently had before this pass:
 *      "has *a* schema" is not the same as "has a REAL one," and a naive
 *      presence check let that one slip through uncaught.
 *
 * ONE documented exception, mirroring quality-gates.yml's migrations-
 * parity job's "one known GIST-index divergence" pattern (an allowlist
 * with an inline reason, not a silent skip): DELETE /api/admin/ratings/:id
 * (AdminRatingsController.remove -> RatingsService.adminDelete) generately
 * returns `void` — a real 200 (no @HttpCode override) with NO body at
 * all. Claiming a schema for that response would be dishonest (there is
 * no content to describe); claiming 204 would misrepresent the actual
 * status code, since nothing in this codebase's convention makes a plain
 * DELETE return 204 without an explicit override. This is the one
 * genuinely-correct "no schema" case, allowlisted by operationId with the
 * reason inline so a FUTURE genuinely-empty endpoint has an obvious
 * place to add itself — and so this allowlist itself stays small and
 * auditable rather than becoming an escape hatch.
 */
const KNOWN_EMPTY_RESPONSES: Record<string, string> = {
  AdminRatingsController_remove:
    "RatingsService.adminDelete() returns void — a genuine 200 (no @HttpCode override) with no response body. Documented via a plain @ApiResponse({status:200, description:...}) with no schema; see admin-ratings.controller.ts.",
};

interface OpenApiOperation {
  operationId?: string;
  responses?: Record<
    string,
    {
      content?: Record<string, { schema?: unknown }>;
    }
  >;
}

type OpenApiPaths = Record<string, Record<string, OpenApiOperation>>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function isVacuousSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return true;
  const s = schema as Record<string, unknown>;
  if (s.type === "object" && !s.properties && !s.$ref && !s.allOf) {
    return true;
  }
  if (
    s.type === "array" &&
    s.items &&
    typeof s.items === "object" &&
    (s.items as Record<string, unknown>).type === "object" &&
    !(s.items as Record<string, unknown>).properties &&
    !(s.items as Record<string, unknown>).$ref
  ) {
    return true;
  }
  return false;
}

function hasRealSchema(op: OpenApiOperation, code: string): boolean {
  const content = op.responses?.[code]?.content;
  if (!content) return false;
  return Object.values(content).some((media) => {
    const schema = media?.schema;
    return schema !== undefined && !isVacuousSchema(schema);
  });
}

function main(): void {
  const specPath = path.resolve(
    process.argv[2] ?? path.resolve(process.cwd(), "../docs/openapi.json"),
  );
  const doc = JSON.parse(fs.readFileSync(specPath, "utf8")) as {
    paths: OpenApiPaths;
  };

  const multiStatusViolations: string[] = [];
  const untypedViolations: string[] = [];
  let totalOperations = 0;

  for (const [urlPath, methods] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!HTTP_METHODS.includes(method)) continue;
      totalOperations++;
      const operationId =
        op.operationId ?? `${method.toUpperCase()} ${urlPath}`;
      const successCodes = Object.keys(op.responses ?? {}).filter((c) =>
        c.startsWith("2"),
      );

      if (successCodes.length === 0) {
        multiStatusViolations.push(
          `${method.toUpperCase()} ${urlPath} (${operationId}): no 2xx response declared at all.`,
        );
        continue;
      }
      if (successCodes.length > 1) {
        multiStatusViolations.push(
          `${method.toUpperCase()} ${urlPath} (${operationId}): ${successCodes.length} distinct 2xx entries (${successCodes.join(", ")}) — a client cannot tell which one the server actually sends.`,
        );
        continue;
      }

      const [code] = successCodes;
      if (!hasRealSchema(op, code)) {
        if (KNOWN_EMPTY_RESPONSES[operationId]) continue;
        untypedViolations.push(
          `${method.toUpperCase()} ${urlPath} (${operationId}): ${code} has no real response schema.`,
        );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `openapi:check-response-types — ${totalOperations} operations checked against ${specPath}.`,
  );

  if (multiStatusViolations.length === 0 && untypedViolations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `All operations have exactly one 2xx response with a real schema (${Object.keys(KNOWN_EMPTY_RESPONSES).length} documented no-content exception(s)).`,
    );
    return;
  }

  if (multiStatusViolations.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\n::error::${multiStatusViolations.length} operation(s) with a phantom/missing status:`,
    );
    for (const v of multiStatusViolations) {
      // eslint-disable-next-line no-console
      console.error(`  - ${v}`);
    }
  }
  if (untypedViolations.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\n::error::${untypedViolations.length} operation(s) with a 2xx that has no real response schema:`,
    );
    for (const v of untypedViolations) {
      // eslint-disable-next-line no-console
      console.error(`  - ${v}`);
    }
  }
  process.exit(1);
}

main();
