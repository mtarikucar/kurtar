import { Module } from "@nestjs/common";
import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import { EDocumentFacadeService } from "./e-document-facade.service";
import { MockEDocumentProvider } from "./adapters/mock-e-document-provider";
import { NilveraAdapter } from "./adapters/nilvera.adapter";
import { TaxpayerLookupService } from "./taxpayer-lookup.service";
import { CommissionInvoiceService } from "./commission-invoice.service";

/**
 * SettlementSentInvoiceHandler is deliberately NOT declared here — same
 * reasoning as MembershipsModule's doc comment on
 * MembershipApprovedHandler: it must be a provider of OutboxModule to
 * reach OutboxHandlerRegistry, so it is imported and registered there
 * even though the class file lives under this folder. This module exports
 * CommissionInvoiceService for exactly that wiring.
 */
@Module({
  providers: [
    EDocumentProviderRegistry,
    EDocumentFacadeService,
    MockEDocumentProvider,
    NilveraAdapter,
    TaxpayerLookupService,
    CommissionInvoiceService,
  ],
  exports: [CommissionInvoiceService],
})
export class InvoicingModule {}
