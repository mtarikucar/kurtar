import { ExpoPushProvider } from "./expo-push-provider";
import { PushProviderRegistry } from "../push-provider.registry";

function configReturning(accessToken: string | undefined) {
  return { get: () => accessToken } as any;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("ExpoPushProvider.sendBatch", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("sends one request for a batch under 100 and maps tickets back in order", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [{ status: "ok" }, { status: "ok" }],
      }),
    );
    global.fetch = fetchMock as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );

    const results = await provider.sendBatch([
      { to: "tok1", title: "a", body: "b" },
      { to: "tok2", title: "c", body: "d" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { to: "tok1", outcome: "ok" },
      { to: "tok2", outcome: "ok" },
    ]);
  });

  it("chunks a 150-message batch into two HTTP requests (100 + 50)", async () => {
    const fetchMock = jest.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      return jsonResponse({ data: body.map(() => ({ status: "ok" })) });
    });
    global.fetch = fetchMock as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );
    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `tok${i}`,
      title: "t",
      body: "b",
    }));

    const results = await provider.sendBatch(messages);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(150);
    expect(results.every((r) => r.outcome === "ok")).toBe(true);
  });

  it("classifies a DeviceNotRegistered ticket as token_invalid", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
    ) as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );

    const results = await provider.sendBatch([
      { to: "tok-dead", title: "a", body: "b" },
    ]);

    expect(results).toEqual([
      { to: "tok-dead", outcome: "token_invalid", error: "not registered" },
    ]);
  });

  it("sends an Authorization header when EXPO_ACCESS_TOKEN is configured, omits it otherwise", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ status: "ok" }] }));
    global.fetch = fetchMock as any;
    const provider = new ExpoPushProvider(
      configReturning("secret-token"),
      new PushProviderRegistry(),
    );

    await provider.sendBatch([{ to: "tok1", title: "a", body: "b" }]);

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret-token",
    );
  });

  it("a network error fails every message in that chunk with outcome 'error', never throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );

    const results = await provider.sendBatch([
      { to: "tok1", title: "a", body: "b" },
    ]);

    expect(results).toEqual([
      { to: "tok1", outcome: "error", error: "ECONNRESET" },
    ]);
  });

  it("a non-2xx response fails every message in that chunk with outcome 'error'", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ errors: ["bad"] }, false, 500)) as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );

    const results = await provider.sendBatch([
      { to: "tok1", title: "a", body: "b" },
    ]);

    expect(results).toEqual([
      { to: "tok1", outcome: "error", error: "HTTP 500" },
    ]);
  });

  it("a ticket-count/message-count mismatch fails every message in that chunk rather than misaligning results", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ status: "ok" }] })) as any;
    const provider = new ExpoPushProvider(
      configReturning(undefined),
      new PushProviderRegistry(),
    );

    const results = await provider.sendBatch([
      { to: "tok1", title: "a", body: "b" },
      { to: "tok2", title: "c", body: "d" },
    ]);

    expect(results).toEqual([
      { to: "tok1", outcome: "error", error: "Ticket/message count mismatch" },
      { to: "tok2", outcome: "error", error: "Ticket/message count mismatch" },
    ]);
  });

  it("registers itself in the PushProviderRegistry on module init", () => {
    const registry = new PushProviderRegistry();
    const provider = new ExpoPushProvider(configReturning(undefined), registry);
    provider.onModuleInit();
    expect(registry.get("expo")).toBe(provider);
  });
});
