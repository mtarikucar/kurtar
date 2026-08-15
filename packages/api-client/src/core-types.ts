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
 * Falls back to `void` for endpoints that genuinely return no body (e.g.
 * `DELETE /admin/ratings/{id}`).
 *
 * `openapi-typescript` emits `responses` keys as NUMERIC literals (`201`,
 * not `"201"`) — `keyof` on that object type therefore yields a union of
 * number literals, and a number literal never structurally matches a
 * STRING template-literal pattern like `` `2${string}` `` (they're
 * different primitive types; `K extends \`2${string}\`` is false for
 * every K here, unconditionally). That collapsed this whole mapped type
 * to `never` for every single operation — every domain method's compiled
 * return type was `Promise<never>`. Not silent in the sense of "no error
 * anywhere" (a consumer accessing a property on the awaited `never` DOES
 * get "Property 'x' does not exist on type 'never'" — which is exactly
 * why three independent app builds worked around it with a cast instead
 * of catching it as a bug); silent in the sense that `never` is
 * assignable TO anything with no complaint, so the value itself flows
 * through untyped call chains, mocked-fetch unit tests, and `tsc
 * --noEmit` on source (see below) without ever tripping an error at the
 * point the bug actually originates. Coercing K through a template
 * literal position first (`` `${K}` ``) actually stringifies the numeric
 * literal at the type level — `` `${201}` `` IS the string literal type
 * `"201"` — which is what makes the pattern match work at all.
 * Regression-tested against the BUILT package's declaration output in
 * test-types/build-output.types.ts (`npm run typecheck:build`), not just
 * `tsc --noEmit` on source — that in-repo check alone was passing
 * throughout the entire time this bug shipped, because the checker can
 * fully resolve a conditional type at a call site with concrete literal
 * arguments even when the DECLARATION EMITTER, printing an unannotated
 * inferred return type, cannot.
 */
export type SuccessBody<P extends ApiPath, M extends HttpMethod> =
  OperationOf<P, M> extends {
    responses: infer R;
  }
    ? {
        [K in keyof R]: K extends number
          ? `${K}` extends `2${string}`
            ? JsonBodyOf<R[K]> extends never
              ? CsvBodyOf<R[K]> extends never
                ? void
                : CsvBodyOf<R[K]>
              : JsonBodyOf<R[K]>
            : never
          : never;
      }[keyof R]
    : never;
