import { join } from "path";

/**
 * Resolves the `.env` file location for ConfigModule.forRoot().
 *
 * @nestjs/config's default (no `envFilePath` given) resolves `.env`
 * relative to `process.cwd()`. The only documented way to run this
 * backend is `npm run dev -w backend` (root package.json) — an
 * `npm run <script> -w <workspace>` invocation sets the *child process's*
 * cwd to the workspace directory, i.e. `backend/`, not the repo root.
 * The repo's `.env.example` (and any `.env` an operator creates from it)
 * lives at the repo root, so the default resolution would silently miss
 * it: DATABASE_URL/REDIS_URL would read as unset even when the operator
 * did everything right, tripping the dev-mode warning and, worse, the
 * production fail-fast throw.
 *
 * `__dirname` always points at *this module's own* directory regardless
 * of cwd, so we derive the repo root from it instead of from cwd. Both
 * this source file (backend/src/config/env-file.ts, run directly by
 * ts-jest/ts-node) and its compiled twin (backend/dist/config/env-file.js,
 * run in dev via `nest start` and in prod via `node dist/main.js`) sit at
 * the same depth — exactly two directories below `backend/` — so the same
 * three-level walk (config -> src|dist -> backend -> repo root) resolves
 * correctly in every case this project runs in today.
 */
export function resolveEnvFilePath(): string {
  return join(__dirname, "..", "..", "..", ".env");
}
