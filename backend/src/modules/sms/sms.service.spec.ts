import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { SmsService } from "./sms.service";

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as ConfigService;
}

describe("SmsService — provider selection", () => {
  const baseEnv = { ...process.env };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    errSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    process.env = { ...baseEnv };
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("defaults to mock outside production when SMS_PROVIDER is unset", () => {
    process.env.NODE_ENV = "development";
    const svc = new SmsService(makeConfig({}));
    expect(svc.getProviderName()).toBe("mock");
    expect(svc.isMockMode()).toBe(true);
  });

  it("refuses to boot with SMS_PROVIDER=mock in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new SmsService(makeConfig({ SMS_PROVIDER: "mock" }))).toThrow(
      /not allowed in production/,
    );
  });

  it("refuses to boot when SMS_PROVIDER is unset (defaults to mock) in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new SmsService(makeConfig({}))).toThrow(
      /not allowed in production/,
    );
  });

  it("selects netgsm when fully configured", () => {
    process.env.NODE_ENV = "development";
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: "netgsm",
        NETGSM_USERCODE: "u",
        NETGSM_PASSWORD: "p",
        NETGSM_MSGHEADER: "h",
      }),
    );
    expect(svc.getProviderName()).toBe("netgsm");
    expect(svc.isMockMode()).toBe(false);
  });

  it("throws when netgsm is selected but credentials are incomplete", () => {
    process.env.NODE_ENV = "development";
    expect(
      () =>
        new SmsService(
          makeConfig({ SMS_PROVIDER: "netgsm", NETGSM_USERCODE: "u" }),
        ),
    ).toThrow(/NETGSM_USERCODE\/NETGSM_PASSWORD\/NETGSM_MSGHEADER/);
  });

  it("throws when twilio is selected but credentials are incomplete", () => {
    process.env.NODE_ENV = "development";
    expect(
      () =>
        new SmsService(
          makeConfig({
            SMS_PROVIDER: "twilio",
            TWILIO_ACCOUNT_SID: "sid",
          }),
        ),
    ).toThrow(/TWILIO_ACCOUNT_SID\/TWILIO_AUTH_TOKEN\/TWILIO_PHONE_NUMBER/);
  });

  it("throws on an unknown provider name", () => {
    process.env.NODE_ENV = "development";
    expect(
      () => new SmsService(makeConfig({ SMS_PROVIDER: "carrier-pigeon" })),
    ).toThrow(/Unknown SMS_PROVIDER/);
  });

  it("masks the phone number in the mock-mode log line", async () => {
    process.env.NODE_ENV = "development";
    const svc = new SmsService(makeConfig({}));

    await svc.send("+905551234567", "OTP: 123456");

    const calls = logSpy.mock.calls.map((c) => c.join(" "));
    const mockLog = calls.find((c) => c.includes("[MOCK SMS]"));
    expect(mockLog).toBeDefined();
    expect(mockLog).not.toContain("+905551234567");
    expect(mockLog).toMatch(/\*/);
    // The message body (including the OTP) stays visible — that's the
    // load-bearing local-dev use case; only the phone is sensitive here.
    expect(mockLog).toContain("OTP: 123456");
  });
});

describe("SmsService.send — retry + non-retryable classification", () => {
  const baseEnv = { ...process.env };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env = { ...baseEnv };
    jest.restoreAllMocks();
  });

  it("does not retry a non-retryable provider error", async () => {
    const svc = new SmsService(makeConfig({}));
    const provider = (svc as unknown as { provider: { send: jest.Mock } })
      .provider;
    provider.send = jest.fn().mockResolvedValue({
      success: false,
      error: "Non-retryable: bad number",
    });

    const result = await svc.send("+905551234567", "hi", 3);

    expect(result.success).toBe(false);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure up to maxRetries then gives up", async () => {
    const svc = new SmsService(makeConfig({}));
    const provider = (svc as unknown as { provider: { send: jest.Mock } })
      .provider;
    provider.send = jest.fn().mockResolvedValue({
      success: false,
      error: "temporary upstream error",
    });

    const result = await svc.send("+905551234567", "hi", 2);

    expect(result.success).toBe(false);
    expect(provider.send).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("succeeds without retrying once the provider returns success", async () => {
    const svc = new SmsService(makeConfig({}));
    const provider = (svc as unknown as { provider: { send: jest.Mock } })
      .provider;
    provider.send = jest
      .fn()
      .mockResolvedValueOnce({ success: false, error: "flaky" })
      .mockResolvedValueOnce({ success: true, messageId: "id-2" });

    const result = await svc.send("+905551234567", "hi", 3);

    expect(result).toEqual({ success: true, messageId: "id-2" });
    expect(provider.send).toHaveBeenCalledTimes(2);
  }, 10_000);
});
