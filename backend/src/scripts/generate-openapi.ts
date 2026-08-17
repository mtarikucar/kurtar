import * as fs from "fs";
import * as path from "path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { buildOpenApiDocument } from "../openapi.setup";

/**
 * `npm run openapi:generate` (backend/package.json) — boots the real
 * AppModule (no `.listen()`, never opens a port) purely to let
 * SwaggerModule introspect its actual route table, writes the result to
 * docs/openapi.json AT THE REPO ROOT (frontends read it from there), and
 * exits. The CI "openapi contract-drift" job (quality-gates.yml) reruns
 * this and diffs the output against the committed file — the same shape
 * as the existing migrations-parity job's "regenerating produces no
 * diff" gate.
 *
 * Booting the real AppModule means this needs a reachable database
 * (PrismaService.onModuleInit eagerly $connect()s) — run against the dev
 * stack or CI's Postgres service container, same as any realdb spec.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Must match main.ts's bootstrap exactly (setGlobalPrefix runs before
  // the document is built there too) — see openapi.setup.ts's doc comment
  // on why the ordering matters.
  app.setGlobalPrefix("api");
  await app.init();

  const document = buildOpenApiDocument(app);

  // npm scripts run with cwd = backend/ (package.json's own directory) —
  // one level up is the repo root.
  const outPath = path.resolve(process.cwd(), "../docs/openapi.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n", "utf8");

  const pathCount = Object.keys(document.paths).length;
  const operationCount = Object.values(document.paths).reduce(
    (sum, methods) => sum + Object.keys(methods as object).length,
    0,
  );
  // eslint-disable-next-line no-console
  console.log(
    `openapi:generate — wrote ${outPath} (${pathCount} unique paths, ${operationCount} operations).`,
  );

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("openapi:generate failed:", error);
  process.exit(1);
});
