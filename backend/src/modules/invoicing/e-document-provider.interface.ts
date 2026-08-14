/**
 * Provider-neutral e-document seam for kurtar's commission invoices —
 * shaped exactly like payments-core's PaymentProvider (interface +
 * registry + facade, adapters self-register in onModuleInit) per the
 * brief's explicit "adapter seam like payments-core" instruction.
 */

export type EDocLineType = "BAG_FEE" | "MEMBERSHIP";

export interface EDocumentInvoiceLine {
  description: string;
  amountCents: number;
  vatCents: number;
}

export interface EDocumentInvoiceInput {
  /** CommissionInvoice.id — this provider call's own idempotency key;
   * every adapter must treat a repeat issue() for the same invoiceId as
   * "already issued", never a duplicate e-document. */
  invoiceId: string;
  docType: "EFATURA" | "EARSIVFATURA";
  buyerTaxId: string;
  buyerLegalName: string;
  lines: EDocumentInvoiceLine[];
  totalAmountCents: number;
}

export interface EDocumentIssueResult {
  /** The provider's own document reference (Nilvera calls this a UUID). */
  docId: string;
  status: "issued";
}

export interface EDocumentProvider {
  readonly id: string;

  issue(invoice: EDocumentInvoiceInput): Promise<EDocumentIssueResult>;

  healthCheck(): Promise<{ ok: boolean; details?: Record<string, unknown> }>;
}
