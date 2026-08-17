import { Module } from "@nestjs/common";
import { PushModule } from "../notifications/push/push.module";
import { EmailModule } from "../notifications/email/email.module";
import { MembershipsModule } from "../memberships/memberships.module";
import { InvoicingModule } from "../invoicing/invoicing.module";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxWorkerService } from "./outbox-worker.service";
import { OfferPublishedHandler } from "./handlers/offer-published.handler";
import { OfferCancelledHandler } from "./handlers/offer-cancelled.handler";
import { OfferCancelledMerchantEmailHandler } from "./handlers/offer-cancelled-merchant-email.handler";
import { ReservationConfirmedHandler } from "./handlers/reservation-confirmed.handler";
import { ReservationRedeemedHandler } from "./handlers/reservation-redeemed.handler";
import { MerchantStatusEmailHandler } from "./handlers/merchant-status-email.handler";
import { SettlementSentEmailHandler } from "./handlers/settlement-sent-email.handler";
import { MembershipApprovedHandler } from "../memberships/membership-approved.handler";
import { SettlementSentInvoiceHandler } from "../invoicing/settlement-sent-invoice.handler";
import { ImpactLedgerHandler } from "../impact/impact-redeemed.handler";

/**
 * The drain worker + handler registry + every handler this task wires up.
 * OutboxService itself lives in OutboxCoreModule (@Global — every
 * producer needs it, none of them need this module). Task 9 adds new
 * handlers by adding a class here, nothing else — the worker and registry
 * are unchanged (OutboxHandlerRegistry.spec.ts / outbox-worker.service.ts's
 * doc comment).
 *
 * [Task 8] MembershipApprovedHandler and SettlementSentInvoiceHandler
 * live under memberships/ and invoicing/ respectively (their owning
 * domain, per this task's file-layout brief) but must still be declared
 * as PROVIDERS of this exact module — OutboxHandlerRegistry is not
 * exported, so it is only reachable from a class instantiated inside
 * THIS module's own provider graph (see either handler's doc comment).
 * MembershipsModule/InvoicingModule are imported so those two handlers'
 * OWN constructor dependencies (MembershipsService,
 * CommissionInvoiceService) resolve.
 */
@Module({
  imports: [PushModule, EmailModule, MembershipsModule, InvoicingModule],
  providers: [
    OutboxHandlerRegistry,
    OutboxWorkerService,
    OfferPublishedHandler,
    OfferCancelledHandler,
    OfferCancelledMerchantEmailHandler,
    ReservationConfirmedHandler,
    ReservationRedeemedHandler,
    MerchantStatusEmailHandler,
    SettlementSentEmailHandler,
    MembershipApprovedHandler,
    SettlementSentInvoiceHandler,
    ImpactLedgerHandler,
  ],
})
export class OutboxModule {}
