import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isValidTaxId } from "../../common/utils/tax-id.util";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { TaxpayerLookupService } from "./taxpayer-lookup.service";
import { EDocumentInvoiceLine } from "./e-document-provider.interface";

/**
 * Creates the commission invoice(s) for a SENT settlement batch (brief
 * §6): a BAG_FEE invoice (bag fees + their KDV) whenever the batch has
 * any, and a SEPARATE MEMBERSHIP invoice whenever the batch offset any
 * membership balance this cycle — never combined into one row, matching
 * InvoiceType's two distinct values and the brief's "BAG_FEE line set +
 * MEMBERSHIP line if offset this batch" wording.
 *
 * WITHHOLDING IS NEVER AN INVOICE LINE, on either invoice — it is a
 * tevkifat (withholding) noted on the payout dekont (the settlement
 * batch's own record), not a commission charge the platform is invoicing
 * the merchant FOR. Asserted by this file never reading
 * batch.withholdingCents anywhere below, and tested explicitly in
 * commission-invoice.service.spec.ts.
 *
 * MEMBERSHIP INVOICE HAS NO SEPARATE VAT LINE — a judgment call, not an
 * oversight: the brief's KDV %20 instruction is explicit and ONLY stated
 * for the bag fee ("fixed ₺ amount + KDV %20"); nothing in the brief
 * says membership dues carry KDV on top. Flagged in task-8-report.md as
 * a call for product/finance to confirm explicitly before this ever goes
 * live against a real e-document provider.
 *
 * Provider I/O (facade.issue) runs OUTSIDE any DB transaction, same as
 * every other provider call in this codebase — the DRAFT row is created
 * and committed FIRST (its own plain Prisma call), then issuance is
 * attempted; a failed/slow issue() never blocks or rolls back the fact
 * that the invoice was drafted.
 */
@Injectable()
export class CommissionInvoiceService {
  private readonly logger = new Logger(CommissionInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: EDocumentFacadeService,
    private readonly taxpayerLookup: TaxpayerLookupService,
  ) {}

  async createInvoicesForSentBatch(batchId: string): Promise<void> {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id: batchId },
      include: {
        merchant: { select: { id: true, taxId: true, legalName: true } },
        settlementLines: {
          select: {
            reservationId: true,
            bagFeeCents: true,
            bagFeeVatCents: true,
          },
        },
      },
    });
    if (!batch) {
      this.logger.warn(
        `createInvoicesForSentBatch: batch ${batchId} no longer exists — skipping`,
      );
      return;
    }

    if (!isValidTaxId(batch.merchant.taxId)) {
      this.logger.error(
        `CRITICAL: merchant ${batch.merchant.id} has an invalid taxId "${batch.merchant.taxId}" — cannot draft a commission invoice for batch ${batchId}; needs manual data correction.`,
      );
      return;
    }

    const isEFaturaUser = await this.taxpayerLookup.checkIsEFaturaUser(
      batch.merchant.taxId,
    );
    // null (lookup unknown/unconfigured) is treated the same as a
    // definite `false` — EARSIVFATURA — per the brief's explicit "unknown
    // ⇒ EARSIVFATURA for now" policy.
    const docType = isEFaturaUser === true ? "EFATURA" : "EARSIVFATURA";

    if (batch.bagFeeCents > 0) {
      const lines: EDocumentInvoiceLine[] = batch.settlementLines
        .filter((l) => l.bagFeeCents > 0)
        .map((l) => ({
          description: `Platform hizmet bedeli — rezervasyon ${l.reservationId}`,
          amountCents: l.bagFeeCents,
          vatCents: l.bagFeeVatCents,
        }));
      await this.createAndIssue({
        merchantId: batch.merchant.id,
        merchantTaxId: batch.merchant.taxId,
        merchantLegalName: batch.merchant.legalName,
        batchId: batch.id,
        type: "BAG_FEE",
        docType,
        netAmountCents: batch.bagFeeCents,
        vatCents: batch.bagFeeVatCents,
        lines,
      });
    }

    if (batch.membershipOffsetCents > 0) {
      await this.createAndIssue({
        merchantId: batch.merchant.id,
        merchantTaxId: batch.merchant.taxId,
        merchantLegalName: batch.merchant.legalName,
        batchId: batch.id,
        type: "MEMBERSHIP",
        docType,
        netAmountCents: batch.membershipOffsetCents,
        vatCents: 0,
        lines: [
          {
            description: "Yıllık üyelik ücreti (dönemsel mahsup)",
            amountCents: batch.membershipOffsetCents,
            vatCents: 0,
          },
        ],
      });
    }
  }

  private async createAndIssue(params: {
    merchantId: string;
    merchantTaxId: string;
    merchantLegalName: string;
    batchId: string;
    type: "BAG_FEE" | "MEMBERSHIP";
    docType: "EFATURA" | "EARSIVFATURA";
    netAmountCents: number;
    vatCents: number;
    lines: EDocumentInvoiceLine[];
  }): Promise<void> {
    const totalAmountCents = params.netAmountCents + params.vatCents;

    const invoice = await this.prisma.commissionInvoice.create({
      data: {
        merchantId: params.merchantId,
        batchId: params.batchId,
        type: params.type,
        docType: params.docType,
        status: "DRAFT",
        netAmountCents: params.netAmountCents,
        vatCents: params.vatCents,
        totalAmountCents,
        linesJson: params.lines as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      const result = await this.facade.issue({
        invoiceId: invoice.id,
        docType: params.docType,
        buyerTaxId: params.merchantTaxId,
        buyerLegalName: params.merchantLegalName,
        lines: params.lines,
        totalAmountCents,
      });
      await this.prisma.commissionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "SENT",
          issuedAt: new Date(),
          nilveraDocId: result.docId,
        },
      });
    } catch (err) {
      this.logger.error(
        `CommissionInvoice ${invoice.id} (${params.type}, batch ${params.batchId}) drafted but issuance failed — left DRAFT for manual/future retry: ${(err as Error).message}`,
      );
    }
  }
}
