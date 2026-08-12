import { basename, dirname, resolve } from "path";
import { resolveEnvFilePath } from "./env-file";

describe("resolveEnvFilePath", () => {
  it("points at the true repo root's .env, not backend/.env or process.cwd()", () => {
    const result = resolveEnvFilePath();
    const resultDir = dirname(result);

    expect(basename(result)).toBe(".env");

    // Landmark check, not a restatement of the implementation's own
    // arithmetic: only the *repo-root* package.json is named "kurtar" and
    // declares the backend workspace. backend/package.json (the file that
    // would sit next to a wrongly-resolved backend/.env) is named
    // "kurtar-backend" and has no "workspaces" field. If the directory walk
    // in resolveEnvFilePath() were off by a level — e.g. landing on
    // backend/ the way @nestjs/config's process.cwd()-relative default
    // does under `npm run dev -w backend` — this assertion fails.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const landmarkPkg = require(resolve(resultDir, "package.json"));
    expect(landmarkPkg.name).toBe("kurtar");
    expect(landmarkPkg.workspaces).toContain("backend");

    // Directly guards the reported bug shape: the resolved directory must
    // not itself be (or end in) "backend/".
    expect(basename(resultDir)).not.toBe("backend");
  });

  it("differs from @nestjs/config's default when the process cwd is the backend workspace", () => {
    // Reproduces, without mutating the real process cwd, exactly the
    // scenario `npm run dev -w backend` creates: cwd = backend/. This is
    // @nestjs/config's own default formula (join(cwd, '.env')) — the value
    // resolveEnvFilePath() must NOT produce when run that way.
    const simulatedWorkspaceCwd = resolve(__dirname, "..", "..");
    expect(basename(simulatedWorkspaceCwd)).toBe("backend");

    const buggyDefaultUnderWorkspaceCwd = resolve(
      simulatedWorkspaceCwd,
      ".env",
    );

    expect(resolveEnvFilePath()).not.toBe(buggyDefaultUnderWorkspaceCwd);
  });
});
