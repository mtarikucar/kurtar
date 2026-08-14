import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EDocumentProviderRegistry } from "../e-document-provider.registry";
import {
  EDocumentInvoiceInput,
  EDocumentIssueResult,
  EDocumentProvider,
} from "../e-document-provider.interface";

/**
 * Nilvera özel entegratör adapter'ı — INERT until credentials (`onModuleInit`
 * only registers this adapter when BOTH `NILVERA_API_KEY` and
 * `NILVERA_API_URL` are set; no test in this suite sets either), and
 * [Fix round, I11] `issue()` itself is now HARD-DISABLED regardless of
 * config — see that method's own doc comment for why "only registers with
 * real credentials" was not a strong enough guarantee on its own. VKN
 * lookup (`isRegisteredEFaturaUser`) and `healthCheck()` stay real —
 * read-only GET requests against the documented API shape, no malformed-
 * document risk — and are exercised once real credentials exist.
 *
 * Auth model (differs from a typical OAuth integrator): Nilvera uses a
 * "Persisted Access Token" — a static API key from the merchant panel,
 * sent as a plain `Bearer` header on every request. There is no separate
 * token endpoint.
 *
 * Endpoint shape ported from kds's sibling adapter
 * (backend/src/modules/accounting/adapters/nilvera.adapter.ts), trimmed to
 * what this file still actually calls — kurtar has no UBL-TR XML generator
 * or e-document signer pipeline (kds's `generateUblTrXml`/
 * `EDocumentSigner`, a much larger accounting-module concern out of this
 * task's scope), which is exactly why `issue()` (Nilvera's document-
 * dispatch endpoints, `/earchive/Send/Xml` and `/einvoice/Send/Xml`) is
 * disabled rather than sending a hand-rolled non-UBL-TR body.
 *
 * Doc references (as ported from kds, unverified against a live sandbox —
 * there is none configured for this task):
 *   - e-Arşiv API:  https://developer.nilvera.com/api/e-arsiv-api
 *   - VKN sorgu:    https://developer.nilvera.com/api/genel-api/mukellef-islemleri/vkn-ile-sorgular
 */
const GENERAL_COMPANY_PATH = "/general/Company";
const CHECK_TAXNUMBER_PATH = "/general/GlobalCompany/Check/TaxNumber";

const NILVERA_FETCH_TIMEOUT_MS = 30_000;

@Injectable()
export class NilveraAdapter implements EDocumentProvider, OnModuleInit {
  readonly id = "nilvera" as const;
  private readonly logger = new Logger(NilveraAdapter.name);
  private readonly apiKey?: string;
  private readonly apiUrl?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: EDocumentProviderRegistry,
  ) {
    this.apiKey =
      this.configService.get<string>("NILVERA_API_KEY") || undefined;
    this.apiUrl = (
      this.configService.get<string>("NILVERA_API_URL") || undefined
    )?.replace(/\/+$/, "");
  }

  onModuleInit(): void {
    if (this.apiKey && this.apiUrl) {
      this.registry.register(this);
    } else {
      this.logger.log(
        "NilveraAdapter INERT — NILVERA_API_KEY/NILVERA_API_URL not both configured, not registering.",
      );
    }
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}` };
  }

  /**
   * [Fix round, I11] HARD-DISABLED, independent of config — this is the
   * one behavior change review flagged as unsafe rather than just
   * "inert": the old version's placeholder XML (invoice id + amount, NOT
   * spec-compliant UBL-TR) would have been genuinely POSTed to a real
   * Nilvera endpoint the moment an operator set NILVERA_API_KEY/
   * NILVERA_API_URL — a plausible real ops action once Nilvera onboarding
   * starts, well before anyone builds the actual UBL-TR generator this
   * needs. Refusing unconditionally means configuring credentials alone
   * can never cause a malformed document to reach a live tax/e-document
   * provider; a future task must explicitly replace this method (with a
   * real UBL-TR builder — kds's `generateUblTrXml` is the reference this
   * was always meant to eventually port) before Nilvera can ever actually
   * issue anything. `isRegisteredEFaturaUser` below is NOT affected — it
   * is a read-only VKN lookup against the documented API with no
   * malformed-document risk, so it stays real once credentials exist.
   */
  async issue(_invoice: EDocumentInvoiceInput): Promise<EDocumentIssueResult> {
    throw new Error(
      "NilveraAdapter.issue() is not implemented — only a placeholder, non-UBL-TR request shape exists. Build a real UBL-TR generator (kds's generateUblTrXml is the reference) before wiring this up to a live Nilvera account.",
    );
  }

  async healthCheck() {
    if (!this.apiKey || !this.apiUrl) {
      return { ok: false, details: { reason: "not configured" } };
    }
    try {
      const response = await fetch(`${this.apiUrl}${GENERAL_COMPANY_PATH}`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(NILVERA_FETCH_TIMEOUT_MS),
      });
      return { ok: response.ok };
    } catch (err) {
      return { ok: false, details: { error: (err as Error).message } };
    }
  }

  /**
   * VKN mükellef sorgusu — the real HTTP-backed half of the "mükellef-
   * lookup provider hook" the brief describes (TaxpayerLookupService is
   * the caller-facing hook; it returns "unknown" today regardless of
   * whether this method exists, because it never calls out to an
   * unconfigured Nilvera — see that service's own doc comment).
   * `true`/`false` is a definite answer; `null` means the lookup itself
   * could not be completed, and the caller falls back to EARSIVFATURA.
   */
  async isRegisteredEFaturaUser(taxId: string): Promise<boolean | null> {
    if (!this.apiKey || !this.apiUrl) return null;
    try {
      const response = await fetch(
        `${this.apiUrl}${CHECK_TAXNUMBER_PATH}/${encodeURIComponent(taxId)}`,
        {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(NILVERA_FETCH_TIMEOUT_MS),
        },
      );
      if (response.status === 404) return false;
      if (!response.ok) return null;
      const d = (await response.json().catch(() => null)) as
        | boolean
        | {
            IsUser?: boolean;
            isUser?: boolean;
            Exist?: boolean;
            Aliases?: unknown[];
          }
        | null;
      if (typeof d === "boolean") return d;
      if (typeof d?.IsUser === "boolean") return d.IsUser;
      if (typeof d?.isUser === "boolean") return d.isUser;
      if (typeof d?.Exist === "boolean") return d.Exist;
      if (Array.isArray(d?.Aliases)) return d.Aliases.length > 0;
      return null;
    } catch (err) {
      this.logger.warn(
        `Nilvera VKN check failed for ${taxId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
