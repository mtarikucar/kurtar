import { Module } from "@nestjs/common";
import { PushModule } from "../notifications/push/push.module";
import { EmailModule } from "../notifications/email/email.module";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxWorkerService } from "./outbox-worker.service";
import { OfferPublishedHandler } from "./handlers/offer-published.handler";
import { OfferCancelledHandler } from "./handlers/offer-cancelled.handler";
import { OfferCancelledMerchantEmailHandler } from "./handlers/offer-cancelled-merchant-email.handler";
import { ReservationConfirmedHandler } from "./handlers/reservation-confirmed.handler";
import { ReservationRedeemedHandler } from "./handlers/reservation-redeemed.handler";
import { MerchantStatusEmailHandler } from "./handlers/merchant-status-email.handler";

/**
 * The drain worker + handler registry + every handler this task wires up.
 * OutboxService itself lives in OutboxCoreModule (@Global — every
 * producer needs it, none of them need this module). Task 9 adds new
 * handlers by adding a class here, nothing else — the worker and registry
 * are unchanged (OutboxHandlerRegistry.spec.ts / outbox-worker.service.ts's
 * doc comment).
 */
@Module({
  imports: [PushModule, EmailModule],
  providers: [
    OutboxHandlerRegistry,
    OutboxWorkerService,
    OfferPublishedHandler,
    OfferCancelledHandler,
    OfferCancelledMerchantEmailHandler,
    ReservationConfirmedHandler,
    ReservationRedeemedHandler,
    MerchantStatusEmailHandler,
  ],
})
export class OutboxModule {}
