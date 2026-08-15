import { waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

import { client } from "../lib/api-client";
import { renderHookWithProviders } from "../test-utils/render";
import { useDiscoveryMap, useDiscoveryOffers } from "../hooks/use-discovery";

const mockOffers = client.discovery.offers as jest.Mock;
const mockMap = client.discovery.map as jest.Mock;

describe("useDiscoveryOffers — filter state -> GET /discovery/offers query params", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOffers.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it("maps lat/lng/radius straight through and defaults page/pageSize", async () => {
    const { result } = await renderHookWithProviders(() =>
      useDiscoveryOffers({ lat: 41.01, lng: 29.02, radiusM: 3000 }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOffers).toHaveBeenCalledWith({
      lat: 41.01,
      lng: 29.02,
      radiusM: 3000,
      category: undefined,
      diet: undefined,
      q: undefined,
      pickupBefore: undefined,
      pickupAfter: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it("passes a selected category through unchanged", async () => {
    const { result } = await renderHookWithProviders(() =>
      useDiscoveryOffers({ lat: 41.01, lng: 29.02, radiusM: 3000, category: "BAKERY" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOffers).toHaveBeenCalledWith(expect.objectContaining({ category: "BAKERY" }));
  });

  it("joins multiple diet flags into the comma-separated string the backend parses", async () => {
    const { result } = await renderHookWithProviders(() =>
      useDiscoveryOffers({
        lat: 41.01,
        lng: 29.02,
        radiusM: 3000,
        diet: "VEGAN,GLUTEN_FREE",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOffers).toHaveBeenCalledWith(
      expect.objectContaining({ diet: "VEGAN,GLUTEN_FREE" }),
    );
  });

  it("forwards a free-text search query", async () => {
    const { result } = await renderHookWithProviders(() =>
      useDiscoveryOffers({ lat: 41.01, lng: 29.02, radiusM: 3000, q: "simit" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockOffers).toHaveBeenCalledWith(expect.objectContaining({ q: "simit" }));
  });

  it("never calls the API when filters are null (no location resolved yet)", async () => {
    await renderHookWithProviders(() => useDiscoveryOffers(null));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockOffers).not.toHaveBeenCalled();
  });
});

describe("useDiscoveryMap — bbox -> GET /discovery/map query params", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap.mockResolvedValue([]);
  });

  it("maps the region bbox and an optional category through", async () => {
    const { result } = await renderHookWithProviders(() =>
      useDiscoveryMap({ west: 28.9, south: 40.9, east: 29.1, north: 41.1 }, "MEAL"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockMap).toHaveBeenCalledWith({
      west: 28.9,
      south: 40.9,
      east: 29.1,
      north: 41.1,
      category: "MEAL",
    });
  });

  it("never calls the API when bbox is null (map not yet shown)", async () => {
    await renderHookWithProviders(() => useDiscoveryMap(null));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockMap).not.toHaveBeenCalled();
  });
});
