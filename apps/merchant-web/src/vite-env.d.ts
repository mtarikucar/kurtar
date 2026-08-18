/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the kurtar API, e.g. "http://localhost:4750" — see docs/frontend-contract.md. */
  readonly VITE_API_BASE_URL?: string;
  /** [I11 fix] Origin of the `landing` app — where the published legal
   * documents (Aracılık Sözleşmesi, etc.) actually live. See
   * shared/externalLinks.ts. */
  readonly VITE_LANDING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
