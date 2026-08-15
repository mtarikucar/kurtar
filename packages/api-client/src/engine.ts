import type {
  ApiPath,
  HttpMethod,
  PathParams,
  PathsWithMethod,
  QueryParams,
  RequestBody,
  SuccessBody,
} from "./core-types";
import { buildPath, buildQuery } from "./path-utils";
import { errorFromNetworkFailure, errorFromResponse } from "./errors";
import type { AuthTokens, ClientActor, CreateClientOptions } from "./transport";

export interface RequestOptions<P extends ApiPath, M extends HttpMethod> {
  query?: QueryParams<P, M>;
  path?: PathParams<P, M>;
  body?: RequestBody<P, M>;
  /**
   * Sends `X-Client-Transport: cookie` when the client's configured
   * transport is "cookie". Only ever set (by the `auth` domain module) on
   * the four auth-issuing calls — sending it elsewhere would be silently
   * ignored by the backend, but setting it only where it's meaningful
   * keeps request traffic matching the documented contract exactly.
   */
  cookieTransportHeader?: boolean;
  signal?: AbortSignal;
}

export interface RequestEngine {
  request<M extends HttpMethod, P extends PathsWithMethod<M>>(
    method: M,
    path: P,
    options?: RequestOptions<P, M>,
  ): Promise<SuccessBody<P, M>>;
}

/**
 * The actor-scoped refresh route. There is no shared `/api/auth/refresh`
 * any more: one refresh cookie for three actors on one shared backend
 * origin is exactly how a merchant surface ended up able to mint an admin
 * session (see `ClientActor`'s doc comment in transport.ts, and
 * backend/src/modules/auth/refresh-cookie-transport.util.ts for the
 * server side). Every surface refreshes on its own actor's path, and the
 * browser only ever attaches that actor's cookie there. (The matching
 * logout routes are called through the typed `auth` domain instead — see
 * domains/auth.ts.)
 */
const ACTOR_PATH_SEGMENT: Record<ClientActor, string> = {
  CONSUMER: "consumer",
  MERCHANT: "merchant",
  ADMIN: "admin",
};

export function refreshPath(actor: ClientActor): string {
  return `/api/auth/${ACTOR_PATH_SEGMENT[actor]}/refresh`;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text.length === 0) return undefined;
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text; // malformed JSON on an otherwise-ok response — surface raw text rather than throw
    }
  }
  return text; // text/csv (admin exports) and anything else
}

/**
 * Builds the client's low-level request engine: a typed fetch wrapper with
 * exactly one piece of non-obvious behavior — single-flight refresh.
 *
 * WHY single-flight matters (this is the load-bearing comment): the
 * backend revokes an entire refresh-token FAMILY the moment a
 * already-rotated token is presented again (backend/src/modules/auth/
 * services/token.service.ts's `refresh()` — "reuse detection"). A screen
 * that fires several authenticated requests at once (a dashboard loading
 * three widgets in parallel, say) and gets back several 401s at the same
 * moment would, with a naive "refresh on every 401" client, fire N
 * concurrent `/auth/<actor>/refresh` calls with the SAME still-valid
 * token. Only the first one to land at the database wins the atomic claim
 * (`UPDATE ... WHERE rotatedAt IS NULL`); every other concurrent call
 * observes the token as already-rotated, which the backend cannot
 * distinguish from a stolen/replayed token — so it revokes the whole
 * family, logging the user out of a session they never actually left.
 * This was flagged in Wave 1 as a client-side requirement, not an
 * optional optimization.
 *
 * The fix: every 401 asks for `refreshOnce()`, which memoizes the
 * in-flight refresh Promise in a closure variable (`inFlightRefresh`) for
 * the lifetime of that one outstanding attempt. N concurrent callers all
 * get the SAME promise, so exactly one refresh request is ever in
 * flight at a time; each of the N original requests then retries with
 * whatever token that single refresh produced.
 */
export function createRequestEngine(
  options: CreateClientOptions,
): RequestEngine {
  const providedFetch =
    options.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!providedFetch) {
    throw new Error(
      "No fetch implementation available in this environment — pass `fetch` explicitly to createClient().",
    );
  }
  // Re-bound to a definitely-not-undefined const: the narrowing above only
  // applies within THIS function body, not inside the nested `rawFetch`
  // closure below (a separate function TS type-checks independently) —
  // without this rebind, TS can't prove `fetchImpl` is callable there.
  const fetchImpl: typeof fetch = providedFetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  // The single-flight memo. Deliberately module-instance-scoped (one per
  // createClient() call, not global) so multiple clients in the same
  // process — e.g. a test suite instantiating several — never share state.
  let inFlightRefresh: Promise<AuthTokens> | null = null;

  async function rawFetch(
    method: HttpMethod,
    rawPath: string,
    args: {
      query?: unknown;
      pathParams?: unknown;
      body?: unknown;
      cookieTransportHeader?: boolean;
      accessToken?: string | null;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    const path = buildPath(
      rawPath,
      args.pathParams as Record<string, string | number> | undefined,
    );
    const url = `${baseUrl}${path}${buildQuery(args.query as Record<string, unknown> | undefined)}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    const hasBody = args.body !== undefined;
    if (hasBody) headers["Content-Type"] = "application/json";
    if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`;
    if (args.cookieTransportHeader && options.transport === "cookie") {
      headers["X-Client-Transport"] = "cookie";
    }

    return fetchImpl(url, {
      method: method.toUpperCase(),
      headers,
      credentials: options.transport === "cookie" ? "include" : "omit",
      body: hasBody ? JSON.stringify(args.body) : undefined,
      signal: args.signal,
    });
  }

  /** The ONE real refresh call. Never routed through `request()` below — it must never itself trigger the 401-retry branch. */
  async function performRefresh(): Promise<AuthTokens> {
    const refreshToken = options.getRefreshToken?.() ?? undefined;
    let response: Response;
    try {
      response = await rawFetch("post", refreshPath(options.actor), {
        body: refreshToken ? { refreshToken } : {},
        cookieTransportHeader: true,
        accessToken: null, // never send a (just-expired) access token on the refresh call itself
      });
    } catch (cause) {
      const err = errorFromNetworkFailure(cause);
      options.onUnauthorized?.();
      throw err;
    }
    if (!response.ok) {
      const err = await errorFromResponse(response);
      options.onUnauthorized?.();
      throw err;
    }
    const tokens = (await parseBody(response)) as AuthTokens;
    options.onTokensIssued?.(tokens);
    return tokens;
  }

  function refreshOnce(): Promise<AuthTokens> {
    if (!inFlightRefresh) {
      inFlightRefresh = performRefresh().finally(() => {
        inFlightRefresh = null;
      });
    }
    return inFlightRefresh;
  }

  async function request<M extends HttpMethod, P extends PathsWithMethod<M>>(
    method: M,
    path: P,
    reqOptions: RequestOptions<P, M> = {},
  ): Promise<SuccessBody<P, M>> {
    const accessToken = options.getAccessToken();
    const fetchArgs = {
      query: reqOptions.query,
      pathParams: reqOptions.path,
      body: reqOptions.body,
      cookieTransportHeader: reqOptions.cookieTransportHeader,
      signal: reqOptions.signal,
    };

    let response: Response;
    try {
      response = await rawFetch(method, path as string, {
        ...fetchArgs,
        accessToken,
      });
    } catch (cause) {
      throw errorFromNetworkFailure(cause);
    }

    if (response.status === 401) {
      // Exactly one refresh in flight no matter how many concurrent
      // requests land here at once (refreshOnce's memoization) — then
      // every one of them retries, once, with whatever token that single
      // refresh produced.
      const refreshed = await refreshOnce(); // throws (already a KurtarApiError) if refresh itself fails

      let retryResponse: Response;
      try {
        retryResponse = await rawFetch(method, path as string, {
          ...fetchArgs,
          accessToken: refreshed.accessToken,
        });
      } catch (cause) {
        throw errorFromNetworkFailure(cause);
      }
      if (!retryResponse.ok) throw await errorFromResponse(retryResponse);
      return (await parseBody(retryResponse)) as SuccessBody<P, M>;
    }

    if (!response.ok) throw await errorFromResponse(response);
    return (await parseBody(response)) as SuccessBody<P, M>;
  }

  return { request };
}
