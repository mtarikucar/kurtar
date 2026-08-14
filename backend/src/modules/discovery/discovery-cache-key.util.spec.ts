import { buildDiscoveryOffersCacheKey } from "./discovery-cache-key.util";

function baseParams() {
  return {
    lat: 40.9909,
    lng: 29.0304,
    radiusM: 3000,
    page: 1,
    pageSize: 20,
  };
}

describe("buildDiscoveryOffersCacheKey", () => {
  it("is deterministic for identical params", () => {
    expect(buildDiscoveryOffersCacheKey(baseParams())).toBe(
      buildDiscoveryOffersCacheKey(baseParams()),
    );
  });

  it("starts with the disc:v1: prefix and embeds a 5-char geohash", () => {
    const key = buildDiscoveryOffersCacheKey(baseParams());
    const parts = key.split(":");
    expect(parts[0]).toBe("disc");
    expect(parts[1]).toBe("v1");
    expect(parts[2]).toHaveLength(5);
    expect(parts[3]).toMatch(/^[0-9a-f]{40}$/); // sha1 hex digest
  });

  it("is stable regardless of diet array element order", () => {
    const a = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      diet: ["VEGAN", "VEGETARIAN"],
    });
    const b = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      diet: ["VEGETARIAN", "VEGAN"],
    });
    expect(a).toBe(b);
  });

  it("changes when radiusM changes", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({ ...baseParams(), radiusM: 5000 });
    expect(a).not.toBe(b);
  });

  it("changes when category changes", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      category: "BAKERY",
    });
    expect(a).not.toBe(b);
  });

  it("changes when the diet SET differs (not just order)", () => {
    const a = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      diet: ["VEGAN"],
    });
    const b = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      diet: ["VEGAN", "GLUTEN_FREE"],
    });
    expect(a).not.toBe(b);
  });

  it("changes when q changes", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({ ...baseParams(), q: "börek" });
    expect(a).not.toBe(b);
  });

  it("changes when page changes", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({ ...baseParams(), page: 2 });
    expect(a).not.toBe(b);
  });

  it("shares the same geohash bucket for two nearby points, same filters", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      lat: 40.9959, // ~550m away — same geohash-5 cell
    });
    expect(a).toBe(b);
  });

  it("differs for two distant points, same filters", () => {
    const a = buildDiscoveryOffersCacheKey(baseParams());
    const b = buildDiscoveryOffersCacheKey({
      ...baseParams(),
      lat: 39.9334,
      lng: 32.8597, // Ankara
    });
    expect(a).not.toBe(b);
  });
});
