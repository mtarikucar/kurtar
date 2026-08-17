import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "crypto";
import { EDocumentProviderRegistry } from "../e-document-provider.registry";
import {
  EDocumentInvoiceInput,
  EDocumentIssueResult,
  EDocumentProvider,
} from "../e-document-provider.interface";

/**
 * In-memory sandbox e-document provider — the only EDocumentProvider that
 * is ever actually CALLED (NilveraAdapter stays INERT — see its own doc
 * comment and task-8-report.md's Discipline section). Never registers in
 * production, mirroring MockPaymentProvider/MockPushProvider's identical
 * guard.
 */
@Injectable()
export class MockEDocumentProvider implements EDocumentProvider, OnModuleInit {
  readonly id = "mock" as const;
  private readonly logger = new Logger(MockEDocumentProvider.name);
  // Keyed by invoiceId — issue() is idempotent the same way
  // MockPaymentProvider.createIntent/payout are: a repeat call for an
  // already-issued invoiceId returns the SAME docId rather than minting a
  // second one.
  private readonly issued = new Map<string, EDocumentIssueResult>();

  constructor(private readonly registry: EDocumentProviderRegistry) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== "production") {
      this.registry.register(this);
    }
  }

  async issue(invoice: EDocumentInvoiceInput): Promise<EDocumentIssueResult> {
    const existing = this.issued.get(invoice.invoiceId);
    if (existing) return existing;

    const result: EDocumentIssueResult = {
      docId: `mock-edoc-${randomBytes(4).toString("hex")}`,
      status: "issued",
    };
    this.issued.set(invoice.invoiceId, result);
    this.logger.log(
      `Mock-issued ${invoice.docType} ${result.docId} for invoice ${invoice.invoiceId} (${invoice.totalAmountCents} kuruş)`,
    );
    return result;
  }

  async healthCheck() {
    return { ok: true, details: { mode: "mock", issued: this.issued.size } };
  }

  getIssuedLog(): ReadonlyMap<string, EDocumentIssueResult> {
    return this.issued;
  }
}
