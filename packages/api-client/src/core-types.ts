/**
 * Generic mapped-type plumbing that derives request/response shapes
 * straight from `generated/openapi-types.ts` (itself generated verbatim
 * from `docs/openapi.json` by `openapi-typescript` — see package.json's
 * `generate` script). Nothing in this file is a hand-copied shape: every
 * exported type is a projection OVER the generated `paths`/`operations`
 * types, so a backend contract change that regenerates that file changes
 * these types too, automatically, with no second place to edit.
 */
import type { paths } from "./generated/openapi-types";

export type HttpMethod = "get" | "put" | "post" | "delete" | "patch";

export type ApiPath = keyof paths;

/** Every path that declares the given HTTP method (mirrors openapi-fetch's own PathsWithMethod helper). */
export type PathsWithMethod<M extends HttpMethod> = {
  [P in ApiPath]: paths[P] extends { [K in M]: unknown } ? P : never;
}[ApiPath];

type OperationOf<
  P extends ApiPath,
  M extends HttpMethod,
> = M extends keyof paths[P] ? paths[P][M] : never;

/** The `query` parameters object for a given path+method, or `never` if it takes none. */
export type QueryParams<P extends ApiPath, M extends HttpMethod> =
  OperationOf<P, M> extends {
    parameters: { query?: infer Q };
  }
    ? Q
    : never;

/** The `{id}`-style path parameters object for a given path+method, or `never` if it takes none. */
export type PathParams<P extends ApiPath, M extends HttpMethod> =
  OperationOf<P, M> extends {
    parameters: { path?: infer PP };
  }
    ? PP
    : never;

/** The JSON request body for a given path+method, or `never` if it takes none. */
export type RequestBody<P extends ApiPath, M extends HttpMethod> =
  OperationOf<P, M> extends {
    requestBody?: { content: { "application/json": infer B } };
  }
    ? B
    : never;

type JsonBodyOf<R> = R extends { content: { "application/json": infer J } }
  ? J
  : never;
type CsvBodyOf<R> = R extends { content: { "text/csv": infer T } } ? T : never;

/**
 * The success (2xx) response body for a given path+method — a union across
 * every declared 2xx status (kurtar's controllers only ever declare one).
 * Falls back to `void` for endpoints with no declared response schema
 * (either genuinely empty, like DELETE .../favorites's 200 with no body,
 * or a backend documentation gap — see docs/frontend-contract.md's "known
 * OpenAPI contract gaps" section for the specific operations affected).
 */
export type SuccessBody<P extends ApiPath, M extends HttpMethod> =
  OperationOf<P, M> extends {
    responses: infer R;
  }
    ? {
        [K in keyof R]: K extends `2${string}`
          ? JsonBodyOf<R[K]> extends never
            ? CsvBodyOf<R[K]> extends never
              ? void
              : CsvBodyOf<R[K]>
            : JsonBodyOf<R[K]>
          : never;
      }[keyof R]
    : never;
