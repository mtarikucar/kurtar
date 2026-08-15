import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { ErrorEnvelopeDto } from "./common/swagger/error-envelope.dto";

/**
 * The one place the OpenAPI document is built — shared between main.ts
 * (mounts the live Swagger UI at /api/docs) and
 * scripts/generate-openapi.ts (writes docs/openapi.json, the committed
 * contract Tasks 10-13's four frontends consume). Both callers MUST call
 * `app.setGlobalPrefix("api")` before this — the document reflects
 * whatever routes are registered on `app` at the moment it's built, so a
 * caller that forgets the prefix would silently generate a spec with
 * every path missing "/api".
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Kurtar API")
    .setDescription(
      [
        "Kurtar — surplus-food marketplace API. The contract for all four",
        "frontends (merchant-web, admin-web, the consumer app, and the",
        "landing site).",
        "",
        "**Auth**: every route requires a bearer access token",
        '(`Authorization: Bearer <token>`) unless explicitly marked "no auth',
        'required" below — obtained via one of the /auth/* endpoints. A web',
        "panel additionally sends `X-Client-Transport: cookie` on every",
        "login/verify/refresh call to receive the refresh token ONLY as an",
        "httpOnly cookie (never in the JSON body) — the mobile app omits",
        "this header and reads the refresh token from the response body",
        "instead.",
        "",
        "**Errors**: every error response is `{statusCode, errorCode,",
        "message}` (ErrorEnvelope, below) — branch on `errorCode`, never on",
        "`message` (not stable across releases, and may be Turkish or",
        "English depending on the request).",
      ].join("\n"),
    )
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .addGlobalParameters({
      name: "X-Client-Transport",
      in: "header",
      required: false,
      schema: { type: "string", enum: ["cookie"] },
      description:
        "Web panels send `cookie` on /auth/otp/verify, /auth/merchant/login, " +
        "/auth/admin/login, and /auth/refresh to receive the refresh token " +
        "ONLY as an httpOnly cookie, stripped out of the JSON body. Omit " +
        "entirely for the mobile app (reads the refresh token from the body).",
    })
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorEnvelopeDto],
  });
}

/**
 * Mounts the interactive Swagger UI at /api/docs — gated to non-production
 * (brief §7: "only when NODE_ENV !== production"). Chosen over an admin-
 * guard-gated route because the UI itself needs to be reachable WITHOUT an
 * access token to be useful at all (a developer exploring the contract
 * before they have credentials) — an admin guard would defeat that; the
 * environment gate keeps the interactive explorer out of the production
 * attack surface entirely instead, matching every other "mock/dev-only
 * surface refused in production" seam already established in this
 * codebase (mock providers, log-only email, etc.) — dev/staging get it,
 * production does not.
 */
export function setupSwaggerUi(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  if (process.env.NODE_ENV === "production") return;
  SwaggerModule.setup("api/docs", app, document);
}
