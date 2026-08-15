/**
 * @kurtar/api-client — the typed contract every kurtar frontend (apps/
 * merchant-web, apps/admin-web, apps/consumer, landing) talks to the
 * backend through. See docs/frontend-contract.md for the usage guide.
 */
export { createClient } from "./client";
export type { KurtarClient } from "./client";

export type {
  CreateClientOptions,
  ClientTransport,
  ClientActor,
  AuthTokens,
} from "./transport";

export { KurtarApiError } from "./errors";

export type { RequestEngine } from "./engine";

export type {
  ApiPath,
  HttpMethod,
  PathsWithMethod,
  QueryParams,
  PathParams,
  RequestBody,
  SuccessBody,
} from "./core-types";

// Re-exported so a consumer needing a raw generated type (e.g. a specific
// DTO shape for a form) never has to reach into src/generated directly.
export type { paths, components, operations } from "./generated/openapi-types";
