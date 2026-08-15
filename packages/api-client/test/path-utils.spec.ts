import { buildPath, buildQuery } from "../src/path-utils";

describe("buildPath", () => {
  it("substitutes a single path parameter", () => {
    expect(buildPath("/api/offers/{id}/cancel", { id: "abc123" })).toBe(
      "/api/offers/abc123/cancel",
    );
  });

  it("substitutes multiple path parameters", () => {
    expect(buildPath("/api/a/{x}/b/{y}", { x: "1", y: "2" })).toBe(
      "/api/a/1/b/2",
    );
  });

  it("URL-encodes parameter values", () => {
    expect(buildPath("/api/me/push-tokens/{token}", { token: "a b/c" })).toBe(
      "/api/me/push-tokens/a%20b%2Fc",
    );
  });

  it("returns the template unchanged when no params are given", () => {
    expect(buildPath("/api/health")).toBe("/api/health");
  });

  it("throws on a missing required parameter", () => {
    expect(() => buildPath("/api/offers/{id}/cancel", {})).toThrow(
      /Missing required path parameter "id"/,
    );
  });

  it("accepts a numeric value", () => {
    expect(buildPath("/api/x/{n}", { n: 42 })).toBe("/api/x/42");
  });
});

describe("buildQuery", () => {
  it("returns an empty string for no query", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({})).toBe("");
  });

  it("serializes simple key/value pairs", () => {
    expect(buildQuery({ page: 1, pageSize: 20 })).toBe("?page=1&pageSize=20");
  });

  it("drops undefined and null values", () => {
    expect(buildQuery({ q: undefined, category: null, page: 1 })).toBe(
      "?page=1",
    );
  });

  it("expands arrays as repeated keys", () => {
    const query = buildQuery({ tag: ["a", "b"] });
    expect(query).toBe("?tag=a&tag=b");
  });
});
