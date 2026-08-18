import { createClient } from "../src/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * [M18 fix] `RequestOptions.signal` was already wired all the way through
 * `engine.ts` into the real `fetch()` call, but no domain method ever
 * exposed it, so no app could ever actually pass one — cancelling an
 * in-flight discovery/history fetch (e.g. a fast filter change) was
 * structurally impossible even though the underlying plumbing supported
 * it. This proves the SAME AbortSignal instance a caller passes actually
 * reaches the underlying `fetch()` call, for every method this fix
 * touched.
 */
describe("domain methods forward an AbortSignal through to fetch (M18)", () => {
  function makeClient(fetchMock: jest.Mock) {
    return createClient({
      baseUrl: "http://api.test",
      transport: "body",
      actor: "CONSUMER",
      getAccessToken: () => null,
      fetch: fetchMock as unknown as typeof fetch,
    });
  }

  it("discovery.offers forwards the caller's signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    );
    const client = makeClient(fetchMock);

    await client.discovery.offers(
      { lat: 41, lng: 29, radiusM: 1000, page: 1, pageSize: 20 },
      { signal: controller.signal },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("discovery.store forwards the caller's signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, {
        store: {
          id: "s1",
          name: "Ada Fırın",
          address: "",
          district: "",
          city: "",
          coverImageUrl: null,
          categoryTags: [],
          openingHoursJson: null,
        },
        todaysOffers: [],
        rating: { average: 0, count: 0 },
      }),
    );
    const client = makeClient(fetchMock);

    await client.discovery.store("s1", { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("reservations.listMine forwards the caller's signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    );
    const client = makeClient(fetchMock);

    await client.reservations.listMine(
      { page: 1, pageSize: 20 },
      { signal: controller.signal },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("still works with no opts argument at all (signal stays optional)", async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    );
    const client = makeClient(fetchMock);

    await expect(
      client.discovery.offers({ lat: 41, lng: 29, radiusM: 1000, page: 1, pageSize: 20 }),
    ).resolves.toBeDefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });
});
