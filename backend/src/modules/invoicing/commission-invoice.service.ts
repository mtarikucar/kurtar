import { Injectable, Logger } from "@nestjs/common";
import { CommissionInvoice, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isValidTaxId } from "../../common/utils/tax-id.util";
import { isUniqueConstraintViolation } from "../../common/utils/prisma-error.util";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { TaxpayerLookupService } from "./taxpayer-lookup.service";
import { EDocumentInvoiceLine } from "./e-document-provider.interface";
import { OpsAlertService } from "../notifications/email/ops-alert.service";

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
 * [Fix round, P2, POLICY DECISION] The MEMBERSHIP invoice NOW carries a
 * real VAT line — a platform's membership/commission invoice to a
 * merchant IS a taxable service in Turkey (the controller's explicit
 * ruling; the original ship's "no KDV on membership" call was wrong).
 * `batch.membershipOffsetVatCents` (the VAT portion of THIS batch's
 * membershipOffsetCents, allocated by membership-offset.service.ts's
 * `splitMembershipOffsetVat` — proportional for a partial offset, all
 * remaining VAT for a fully-clearing one) is read straight off the batch,
 * never re-derived here.
 *
 * Provider I/O (facade.issue) runs OUTSIDE any DB transaction, same as
 * every other provider call in this codebase — the DRAFT row is created
 * and committed FIRST (its own plain Prisma call), then issuance is
 * attempted; a failed/slow issue() never blocks or rolls back the fact
 * that the invoice was drafted.
 *
 * [Fix round #6, C2] IDEMPOTENT BY (batch, type). This handler runs off
 * the outbox, which is at-least-once by construction: a throwing handler
 * is retried with backoff, and a handler that SUCCEEDED but whose
 * markDone write failed is deliberately left PROCESSING for the
 * stale-lease reclaim to dispatch exactly once more (outbox-worker.
 * service.ts:271-313). Before this fix, `createAndIssue` opened with an
 * unconditional `commissionInvoice.create` and there was no unique
 * constraint behind it, so a redelivery minted a SECOND row — with a
 * SECOND `invoice.id`, which is precisely the value passed to the
 * provider as its idempotency key. The provider's own dedupe therefore
 * could never fire, and the second call issued a second, legally valid
 * e-fatura for the same batch. That is not a test-only concern:
 * NilveraAdapter is a real provider selected by EDOC_PROVIDER, and the
 * mock refuses to register when NODE_ENV=production.
 *
 * Now: `@@unique([batchId, type])` (migration
 * 20260818090000_commission_invoice_batch_type_unique) makes the row
 * unique in storage, `findOrCreateDraft` reuses whatever is already
 * there (including under a genuine race, via the P2002 branch), an
 * already-SENT invoice returns without touching the provider at all, and
 * a still-DRAFT one is re-issued with the SAME invoice.id — which the
 * EDocumentProvider contract explicitly requires every adapter to treat
 * as "already issued".
 *
 * [Fix round #6, I1] A FAILED ISSUE IS NO LONGER A DEAD END. The catch
 * around `facade.issue` used to swallow the error, so the outbox marked
 * the event DONE and the retry/backoff/DEAD machinery never engaged: a
 * provider outage during the payout window left a day of invoices DRAFT
 * with nothing but a log line, no retry, no queue and no alert. It now
 * rethrows — safe only because of the idempotency above — so the outbox
 * retries it, and `CommissionInvoiceDraftAlertService` emails ops about
 * anything still DRAFT hours later. The invalid-taxId branch stays
 * non-throwing (retrying cannot fix bad master data) but now raises the
 * same ops alert instead of only logging.
 */
@Injectable()
export class CommissionInvoiceService {
  private readonly logger = new Logger(CommissionInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facade: EDocumentFacadeService,
    private readonly taxpayerLookup: TaxpayerLookupService,
    private readonly opsAlert: OpsAlertService,
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
      // [Fix round #6, I1] Still non-throwing — a retry cannot fix bad
      // master data, and letting this event churn through the backoff
      // ladder to DEAD would only bury it. But it no longer ends at a
      // logger.error nobody reads: the same ops digest the DRAFT sweep
      // uses carries it to a human who can correct the record.
      this.logger.error(
        `CRITICAL: merchant ${batch.merchant.id} has an invalid taxId "${batch.merchant.taxId}" — cannot draft a commission invoice for batch ${batchId}; needs manual data correction.`,
      );
      await this.opsAlert.trySend(
        "Komisyon faturası kesilemedi — geçersiz VKN/TCKN",
        "Ödemesi gönderilen bir hakediş için komisyon faturası hiç oluşturulamadı; işletmenin vergi numarası geçersiz. Manuel veri düzeltmesi gerekiyor:",
        [
          `Hakediş ${batchId} — işletme ${batch.merchant.id} (${batch.merchant.legalName}) — kayıtlı VKN/TCKN: "${batch.merchant.taxId}"`,
        ],
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
      // [Fix round, P2] Net = the offset total minus its VAT portion —
      // membershipOffsetVatCents is already the authoritative split
      // (membership-offset.service.ts's splitMembershipOffsetVat, applied
      // at recompute time), never re-derived here.
      const membershipNetCents =
        batch.membershipOffsetCents - batch.membershipOffsetVatCents;
      await this.createAndIssue({
        merchantId: batch.merchant.id,
        merchantTaxId: batch.merchant.taxId,
        merchantLegalName: batch.merchant.legalName,
        batchId: batch.id,
        type: "MEMBERSHIP",
        docType,
        netAmountCents: membershipNetCents,
        vatCents: batch.membershipOffsetVatCents,
        lines: [
          {
            description: "Yıllık üyelik ücreti (dönemsel mahsup)",
            amountCents: membershipNetCents,
            vatCents: batch.membershipOffsetVatCents,
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
    const invoice = await this.findOrCreateDraft(params, totalAmountCents);

    // [Fix round #6, C2] A redelivery of the same event finds the invoice
    // already issued. Returning here — rather than calling the provider
    // "just to be sure" — is the whole point: this is a real e-fatura,
    // and the only safe number of times to issue one is exactly once.
    if (invoice.status !== "DRAFT") {
      this.logger.log(
        `CommissionInvoice ${invoice.id} (${params.type}, batch ${params.batchId}) is already ${invoice.status} (provider doc ${invoice.nilveraDocId ?? "—"}) — redelivery of an already-completed event; not issuing a second e-document.`,
      );
      return;
    }

    let docId: string;
    try {
      const result = await this.facade.issue({
        // The SAME id on every attempt — the EDocumentProvider contract
        // requires adapters to treat a repeat issue() for one invoiceId as
        // "already issued", so the retry below can never duplicate the
        // document at the provider either.
        invoiceId: invoice.id,
        docType: params.docType,
        buyerTaxId: params.merchantTaxId,
        buyerLegalName: params.merchantLegalName,
        lines: params.lines,
        totalAmountCents,
      });
      docId = result.docId;
    } catch (err) {
      // [Fix round #6, I1] RETHROWN, not swallowed: the outbox's backoff
      // is the retry mechanism this path never had. Safe only because the
      // row above is now looked up rather than re-created.
      this.logger.error(
        `CommissionInvoice ${invoice.id} (${params.type}, batch ${params.batchId}) drafted but issuance FAILED — staying DRAFT and rethrowing so the outbox retries it: ${(err as Error).message}`,
      );
      throw err;
    }

    // [Fix round #6, C2] OUTSIDE the issue() try-block. This update used
    // to sit inside it, so a failure to RECORD a successful issuance was
    // logged as "drafted but issuance failed — left DRAFT" — the precise
    // opposite of what had happened, on the one branch where a human
    // needs the truth (a document exists at the provider and carries a
    // real tax consequence). It gets its own message, and rethrows for
    // the same reason as above: the next attempt re-issues with the same
    // invoice id, the provider returns the same docId, and the row
    // finally records it.
    try {
      await this.prisma.commissionInvoice.update({
        where: { id: invoice.id },
        data: { status: "SENT", issuedAt: new Date(), nilveraDocId: docId },
      });
    } catch (err) {
      this.logger.error(
        `CRITICAL: CommissionInvoice ${invoice.id} (${params.type}, batch ${params.batchId}) WAS ISSUED at the provider as document ${docId}, but recording that failed — the row is still DRAFT while a real e-document exists. Rethrowing so the outbox retries (the re-issue is deduped by invoice id): ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * [Fix round #6, C2] The (batchId, type) row, created once. The read
   * covers the ordinary redelivery; the P2002 branch covers the genuine
   * race (two workers dispatching the same event concurrently), where the
   * loser must adopt the winner's row rather than fail the event — the
   * unique index added by 20260818090000_commission_invoice_batch_type_unique
   * is what makes that branch reachable instead of theoretical.
   */
  private async findOrCreateDraft(
    params: {
      merchantId: string;
      batchId: string;
      type: "BAG_FEE" | "MEMBERSHIP";
      docType: "EFATURA" | "EARSIVFATURA";
      netAmountCents: number;
      vatCents: number;
      lines: EDocumentInvoiceLine[];
    },
    totalAmountCents: number,
  ): Promise<CommissionInvoice> {
    const where = { batchId: params.batchId, type: params.type };
    const existing = await this.prisma.commissionInvoice.findFirst({ where });
    if (existing) return existing;

    try {
      return await this.prisma.commissionInvoice.create({
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
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) throw err;
      this.logger.warn(
        `CommissionInvoice for batch ${params.batchId} (${params.type}) was created concurrently — adopting the existing row instead of drafting a second one.`,
      );
      return this.prisma.commissionInvoice.findFirstOrThrow({ where });
    }
  }
}
