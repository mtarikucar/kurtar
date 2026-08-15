import { createClient } from "../src/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createClient", () => {
  it("wires every domain namespace and dispatches through the shared engine", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === "http://api.test/api/health")
        return jsonResponse(200, { status: "ok" });
      if (url === "http://api.test/api/impact/public")
        return jsonResponse(200, { totalBagsSaved: 100 });
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const client = createClient({
      baseUrl: "http://api.test",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(await client.health.check()).toEqual({ status: "ok" });
    expect(await client.impact.getPublic()).toEqual({ totalBagsSaved: 100 });

    // Every domain namespace the four apps need is present.
    for (const domain of [
      "health",
      "auth",
      "merchant",
      "offers",
      "discovery",
      "reservations",
      "complaints",
      "admin",
      "impact",
      "favorites",
      "ratings",
      "settlements",
      "account",
    ] as const) {
      expect(client[domain]).toBeDefined();
    }
  });

  it("strips a trailing slash from baseUrl", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toBe("http://api.test/api/health");
      return jsonResponse(200, { status: "ok" });
    });
    const client = createClient({
      baseUrl: "http://api.test/",
      transport: "body",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.health.check();
  });
});
