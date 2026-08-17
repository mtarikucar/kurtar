/**
 * Every kurtar backend controller that throws a deliberate business error
 * does so as `new SomeHttpException({ statusCode, errorCode, message })`
 * (see backend/src/common/swagger/error-envelope.dto.ts's doc comment and
 * any `modules/*.service.ts` error-factory function for the pattern) — the
 * `errorCode` field is the stable, machine-readable value apps should
 * branch on (e.g. `"OFFER_UNAVAILABLE"`, `"MERCHANT_NOT_APPROVED"`), never
 * `message` (human-readable, not stable across releases, may be Turkish
 * or English).
 *
 * Not EVERY error response carries an `errorCode`, though: framework-level
 * exceptions thrown with a plain string (e.g. `passport-jwt`/`JwtStrategy`'s
 * `new UnauthorizedException("Account is not active")`, or Nest's own
 * validation-pipe rejections) serialize to Nest's default shape
 * `{ statusCode, message, error }` with NO `errorCode` field. `fromResponse`
 * below handles both: a real `errorCode` is preserved verbatim; its absence
 * falls back to a derived code (from Nest's `error` string, e.g.
 * `"Unauthorized"` -> `"UNAUTHORIZED"`) so callers always have SOMETHING
 * stable to switch on, clearly distinguishable (by shape, not by guessing)
 * from a genuine backend-declared code.
 */
export class KurtarApiError extends Error {
  /** HTTP status code of the failed response (0 for a network-level failure — no response was ever received). */
  readonly statusCode: number;
  /** Stable machine-readable code — either the backend's own `errorCode`, or a best-effort fallback (see class doc). */
  readonly errorCode: string;
  /** True when `errorCode` came directly from the backend's error envelope, false when this class derived a fallback. */
  readonly isBackendErrorCode: boolean;
  /** The raw parsed response body, when one existed and was JSON — for callers that need a field this class doesn't surface. */
  readonly body?: unknown;

  constructor(params: {
    statusCode: number;
    errorCode: string;
    message: string;
    isBackendErrorCode: boolean;
    body?: unknown;
  }) {
    super(params.message);
    this.name = "KurtarApiError";
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.isBackendErrorCode = params.isBackendErrorCode;
    this.body = params.body;
    // Restores `instanceof KurtarApiError` under the ES5-target/Babel
    // transpilation some RN toolchains still apply to node_modules, where
    // `Error` subclassing otherwise silently loses its prototype chain.
    Object.setPrototypeOf(this, KurtarApiError.prototype);
  }

  /** True for a request that never reached the server (offline, DNS failure, timeout) — statusCode is 0 in that case. */
  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}

function deriveFallbackCode(
  statusCode: number,
  nestErrorField: unknown,
): string {
  if (typeof nestErrorField === "string" && nestErrorField.trim().length > 0) {
    const upper = nestErrorField
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (upper.length > 0) return upper;
  }
  return `HTTP_${statusCode}`;
}

/** Builds a KurtarApiError from a non-ok fetch Response, reading its body once (JSON when possible, raw text otherwise). */
export async function errorFromResponse(
  response: Response,
): Promise<KurtarApiError> {
  const statusCode = response.status;
  let body: unknown;
  let rawText = "";
  try {
    rawText = await response.text();
    body = rawText.length > 0 ? JSON.parse(rawText) : undefined;
  } catch {
    // Non-JSON error body (an HTML proxy error page, a stripped 502 from
    // in front of the app, etc.) — fall through with `body` undefined and
    // the raw text as the message below.
  }

  if (body && typeof body === "object") {
    const envelope = body as {
      errorCode?: unknown;
      message?: unknown;
      error?: unknown;
    };
    const hasBackendErrorCode =
      typeof envelope.errorCode === "string" && envelope.errorCode.length > 0;
    const message =
      typeof envelope.message === "string"
        ? envelope.message
        : Array.isArray(envelope.message)
          ? envelope.message.join(" ") // class-validator's ValidationPipe returns message as string[]
          : `Request failed with status ${statusCode}.`;
    return new KurtarApiError({
      statusCode,
      errorCode: hasBackendErrorCode
        ? (envelope.errorCode as string)
        : deriveFallbackCode(statusCode, envelope.error),
      message,
      isBackendErrorCode: hasBackendErrorCode,
      body,
    });
  }

  return new KurtarApiError({
    statusCode,
    errorCode: `HTTP_${statusCode}`,
    message:
      rawText.length > 0
        ? rawText.slice(0, 500)
        : `Request failed with status ${statusCode}.`,
    isBackendErrorCode: false,
  });
}

/** Wraps a network-level failure (fetch itself rejected — offline, DNS, CORS preflight failure, timeout/abort). */
export function errorFromNetworkFailure(cause: unknown): KurtarApiError {
  const message =
    cause instanceof Error ? cause.message : "Network request failed.";
  return new KurtarApiError({
    statusCode: 0,
    errorCode: "NETWORK_ERROR",
    message,
    isBackendErrorCode: false,
  });
}
