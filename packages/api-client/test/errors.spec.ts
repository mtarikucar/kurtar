import {
  KurtarApiError,
  errorFromNetworkFailure,
  errorFromResponse,
} from "../src/errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("errorFromResponse", () => {
  it("preserves the backend's errorCode and message verbatim", async () => {
    const res = jsonResponse(409, {
      statusCode: 409,
      errorCode: "OFFER_UNAVAILABLE",
      message: "This offer no longer has bags available.",
    });
    const err = await errorFromResponse(res);
    expect(err).toBeInstanceOf(KurtarApiError);
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe("OFFER_UNAVAILABLE");
    expect(err.message).toBe("This offer no longer has bags available.");
    expect(err.isBackendErrorCode).toBe(true);
  });

  it("derives a fallback code from Nest's default `error` field when errorCode is absent", async () => {
    // Mirrors JwtStrategy's `new UnauthorizedException("Account is not active")`
    // — Nest's default HttpException body has no `errorCode` field.
    const res = jsonResponse(401, {
      statusCode: 401,
      message: "Account is not active",
      error: "Unauthorized",
    });
    const err = await errorFromResponse(res);
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Account is not active");
    expect(err.isBackendErrorCode).toBe(false);
  });

  it("joins a class-validator string[] message into one string", async () => {
    const res = jsonResponse(400, {
      statusCode: 400,
      message: ["phone must be a valid phone number", "code must be 6 digits"],
      error: "Bad Request",
    });
    const err = await errorFromResponse(res);
    expect(err.errorCode).toBe("BAD_REQUEST");
    expect(err.message).toBe(
      "phone must be a valid phone number code must be 6 digits",
    );
  });

  it("falls back to HTTP_<status> when the body has neither errorCode nor error", async () => {
    const res = jsonResponse(500, {});
    const err = await errorFromResponse(res);
    expect(err.errorCode).toBe("HTTP_500");
  });

  it("handles a non-JSON error body (e.g. an HTML proxy error page) without throwing", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    const err = await errorFromResponse(res);
    expect(err.statusCode).toBe(502);
    expect(err.errorCode).toBe("HTTP_502");
    expect(err.message).toContain("502 Bad Gateway");
  });
});

describe("errorFromNetworkFailure", () => {
  it("produces a NETWORK_ERROR with statusCode 0 and isNetworkError true", () => {
    const err = errorFromNetworkFailure(new TypeError("fetch failed"));
    expect(err.statusCode).toBe(0);
    expect(err.errorCode).toBe("NETWORK_ERROR");
    expect(err.isNetworkError).toBe(true);
    expect(err.message).toBe("fetch failed");
  });

  it("falls back to a generic message for a non-Error cause", () => {
    const err = errorFromNetworkFailure("boom");
    expect(err.message).toBe("Network request failed.");
  });
});
