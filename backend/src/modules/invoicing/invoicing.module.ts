import { Module } from "@nestjs/common";
import { EmailModule } from "../notifications/email/email.module";
import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { MockEDocumentProvider } from "./adapters/mock-e-document-provider";
import { NilveraAdapter } from "./adapters/nilvera.adapter";
import { TaxpayerLookupService } from "./taxpayer-lookup.service";
import { CommissionInvoiceService } from "./commission-invoice.service";
import { CommissionInvoiceDraftAlertService } from "./commission-invoice-draft-alert.service";
import { AdminInvoicesController } from "./admin-invoices.controller";

/**
 * SettlementSentInvoiceHandler is deliberately NOT declared here — same
 * reasoning as MembershipsModule's doc comment on
 * MembershipApprovedHandler: it must be a provider of OutboxModule to
 * reach OutboxHandlerRegistry, so it is imported and registered there
 * even though the class file lives under this folder. This module exports
 * CommissionInvoiceService for exactly that wiring.
 */
@Module({
  // [Fix round #6, I1] EmailModule for OpsAlertService — an unissuable
  // commission invoice now reaches OPS_ALERT_EMAIL instead of ending at a
  // log line.
  imports: [EmailModule],
  // [Cross-lane fix, M16] The admin DRAFT queue + re-issue action — the
  // first surface of any kind over CommissionInvoice.
  controllers: [AdminInvoicesController],
  providers: [
    EDocumentProviderRegistry,
    EDocumentFacadeService,
    MockEDocumentProvider,
    NilveraAdapter,
    TaxpayerLookupService,
    CommissionInvoiceService,
    CommissionInvoiceDraftAlertService,
  ],
  exports: [CommissionInvoiceService],
})
export class InvoicingModule {}
