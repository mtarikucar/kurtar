import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EDocumentProviderRegistry } from "../e-document-provider.registry";
import {
  EDocumentInvoiceInput,
  EDocumentIssueResult,
  EDocumentProvider,
} from "../e-document-provider.interface";

/**
 * Nilvera özel entegratör adapter'ı — INERT until credentials, built
 * against the documented API shape (developer.nilvera.com) but never
 * exercised by any test in this task: `onModuleInit` only registers this
 * adapter when BOTH `NILVERA_API_KEY` and `NILVERA_API_URL` are set, and
 * no test in this suite sets either — EDOC_PROVIDER defaults to "mock"
 * everywhere tests run (see env.validation.ts), so
 * `EDocumentProviderRegistry.get("nilvera")` is simply never reachable in
 * CI/local test runs; if it somehow were, the registry throws a clean
 * "Unknown e-document provider" rather than this class attempting a real
 * network call with undefined credentials.
 *
 * Auth model (differs from a typical OAuth integrator): Nilvera uses a
 * "Persisted Access Token" — a static API key from the merchant panel,
 * sent as a plain `Bearer` header on every request. There is no separate
 * token endpoint.
 *
 * Endpoint shape ported from kds's sibling adapter
 * (backend/src/modules/accounting/adapters/nilvera.adapter.ts), trimmed
 * to what kurtar's simpler single-tenant-per-request commission invoice
 * actually needs — kurtar has no UBL-TR XML generator or e-document
 * signer pipeline (kds's `generateUblTrXml`/`EDocumentSigner`, a much
 * larger accounting-module concern out of this task's scope); `issue()`
 * below sends a MINIMAL representative XML body sufficient to prove the
 * request shape (multipart "file" field, matching Nilvera's documented
 * Send/Xml contract) — full spec-compliant UBL-TR generation is
 * deliberately left as future work for whenever this adapter actually
 * activates, called out again in that method's own comment.
 *
 * Doc references (as ported from kds, unverified against a live sandbox —
 * there is none configured for this task):
 *   - e-Arşiv API:  https://developer.nilvera.com/api/e-arsiv-api
 *   - VKN sorgu:    https://developer.nilvera.com/api/genel-api/mukellef-islemleri/vkn-ile-sorgular
 */
const EARCHIVE_SEND_XML_PATH = "/earchive/Send/Xml";
const EINVOICE_SEND_XML_PATH = "/einvoice/Send/Xml";
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
   * `ublXml` below is a MINIMAL placeholder body (invoice id + amounts),
   * NOT spec-compliant UBL-TR — see the class doc comment. Building a real
   * UBL-TR document is real work (kds's `generateUblTrXml`) that this
   * adapter deliberately does not port, since it can never run in this
   * task (no credentials configured anywhere this code executes).
   */
  async issue(invoice: EDocumentInvoiceInput): Promise<EDocumentIssueResult> {
    if (!this.apiKey || !this.apiUrl) {
      throw new Error(
        "NilveraAdapter.issue() called without NILVERA_API_KEY/NILVERA_API_URL configured — this should be unreachable (onModuleInit never registers this adapter in that state).",
      );
    }

    const placeholderXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice><ID>${invoice.invoiceId}</ID><PayableAmount>${
      invoice.totalAmountCents / 100
    }</PayableAmount></Invoice>`;

    const path =
      invoice.docType === "EFATURA"
        ? EINVOICE_SEND_XML_PATH
        : EARCHIVE_SEND_XML_PATH;

    const form = new FormData();
    form.append(
      "file",
      new Blob([placeholderXml], { type: "application/xml" }),
      `${invoice.invoiceId}.xml`,
    );

    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
      signal: AbortSignal.timeout(NILVERA_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Nilvera dispatch failed (HTTP ${response.status}): ${text.slice(0, 500)}`,
      );
    }

    const data = (await response.json().catch(() => null)) as
      | { UUID?: string; uuid?: string; InvoiceUUID?: string; id?: string }
      | Array<Record<string, unknown>>
      | null;
    const first = Array.isArray(data) ? data[0] : data;
    const docId =
      (first?.UUID as string) ??
      (first?.uuid as string) ??
      (first?.InvoiceUUID as string) ??
      (first?.id as string) ??
      null;
    if (!docId) {
      throw new Error("Nilvera dispatch returned no invoice UUID");
    }
    return { docId, status: "issued" };
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
