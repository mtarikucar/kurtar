import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// A real nodemailer transporter's .verify() opens an actual TCP/DNS
// connection attempt — even against a fake host, that can hang a test
// worker for the OS-level connect timeout (observed: tens of seconds).
// Mocking the module keeps "does NOT throw when fully configured"
// deterministic and network-free; every mock-mode test below never
// constructs a transporter at all (EMAIL_HOST is unset), so this mock is
// inert for them.
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn((cb: (err: unknown) => void) => cb(null)),
    sendMail: jest.fn().mockResolvedValue({ messageId: "mock-id" }),
  })),
}));

import { EmailService } from "./email.service";

function configReturning(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] } as any;
}

describe("EmailService — production without SMTP configured refuses to boot", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("throws at construction when NODE_ENV=production and EMAIL_HOST/USER/PASSWORD are missing", () => {
    process.env.NODE_ENV = "production";
    expect(() => new EmailService(configReturning({}))).toThrow(
      /log-only mail transport is not allowed in production/,
    );
  });

  it("throws at construction when NODE_ENV=production and only some SMTP vars are set", () => {
    process.env.NODE_ENV = "production";
    expect(
      () =>
        new EmailService(configReturning({ EMAIL_HOST: "smtp.example.com" })),
    ).toThrow(/log-only mail transport is not allowed in production/);
  });

  it("does NOT throw in production when EMAIL_HOST/USER/PASSWORD are all set", () => {
    process.env.NODE_ENV = "production";
    expect(
      () =>
        new EmailService(
          configReturning({
            EMAIL_HOST: "smtp.example.com",
            EMAIL_PORT: 587,
            EMAIL_USER: "user",
            EMAIL_PASSWORD: "pass",
          }),
        ),
    ).not.toThrow();
  });
});

describe("EmailService — template rendering + mock mode (dev/test)", () => {
  let storageRoot: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kurtar-email-spec-"));
    const templatesDir = path.join(storageRoot, "templates", "emails");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir, "test-template.hbs"),
      "<p>Merhaba {{name}}</p>",
    );
    process.chdir(storageRoot);
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  function newMockService(): EmailService {
    return new EmailService(configReturning({}));
  }

  it("no SMTP configured outside production -> sendEmail logs (mock mode) and returns true, never throws", async () => {
    const service = newMockService();

    const result = await service.sendEmail({
      to: "merchant@example.com",
      subject: "Test",
      template: "test-template",
      context: { name: "World" },
    });

    expect(result).toBe(true);
  });

  it("rejects sendEmail (surfacing the error) when the named template does not exist on disk", async () => {
    const service = newMockService();
    await expect(
      service.sendEmail({
        to: "x@example.com",
        subject: "Test",
        template: "does-not-exist",
        context: {},
      }),
    ).rejects.toThrow(/Email template does-not-exist not found or invalid/);
  });

  it("caches a compiled template across renders (private templateCache populated once)", async () => {
    const service = newMockService();
    const cache: Map<string, unknown> = (service as any).templateCache;
    expect(cache.size).toBe(0);

    await service.sendEmail({
      to: "a@example.com",
      subject: "S1",
      template: "test-template",
      context: { name: "Alice" },
    });
    await service.sendEmail({
      to: "b@example.com",
      subject: "S2",
      template: "test-template",
      context: { name: "Bob" },
    });

    expect(cache.size).toBe(1);
    expect(cache.has("test-template")).toBe(true);
  });
});
