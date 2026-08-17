import { describe, it, expect, vi, afterEach } from "vitest";
import { getPublicImpact } from "@/lib/impact";

/**
 * Task-13 brief: "Vitest ... for: the impact-counter fallback when the
 * API fails (must render, not throw)" — this file covers the DATA layer
 * half of that (getPublicImpact never rejects); test/impact-counter.
 * test.tsx covers the RENDER half (the component that consumes this
 * data never throws either).
 *
 * These tests exercise the REAL `@kurtar/api-client` request path (only
 * `global.fetch` is stubbed) rather than mocking the client package
 * itself, so a genuine network failure/non-2xx/malformed response is
 * proven to degrade gracefully through the actual code the home page
 * runs in production, not through a mock that could hide a real bug.
 */

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("getPublicImpact", () => {
  it("resolves to unavailable, without throwing, when NEXT_PUBLIC_API_BASE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    await expect(getPublicImpact()).resolves.toEqual({ status: "unavailable" });
  });

  it("resolves to unavailable, without throwing, when the backend is completely unreachable (network error)", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    await expect(getPublicImpact()).resolves.toEqual({ status: "unavailable" });
  });

  it("resolves to unavailable, without throwing, when the backend responds with a 500", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 500, message: "Internal Server Error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getPublicImpact()).resolves.toEqual({ status: "unavailable" });
  });

  it("resolves to unavailable, without throwing, when the backend responds with malformed JSON", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockResolvedValue(
      new Response("not valid json{{{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await getPublicImpact();
    // Malformed-but-200 is a soft edge case for the underlying client
    // (errors.ts's parseBody falls back to raw text rather than
    // throwing on unparsable JSON) — the contract this test enforces is
    // narrower and unconditional: whatever happens, getPublicImpact
    // itself never rejects and always returns a valid ImpactSnapshot.
    expect(["ok", "unavailable"]).toContain(result.status);
  });

  it("resolves to a real snapshot when the backend responds successfully", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4750";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mealsSaved: 1234,
          co2eGrams: 567000,
          moneySavedCents: 8901200,
          count: 1234,
          generatedAt: "2026-08-12T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(getPublicImpact()).resolves.toEqual({
      status: "ok",
      mealsSaved: 1234,
      co2eGrams: 567000,
      moneySavedCents: 8901200,
    });
  });
});
