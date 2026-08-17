import { Module } from "@nestjs/common";
import { EmailModule } from "../notifications/email/email.module";
import { ReservationsModule } from "../reservations/reservations.module";
import { AdminComplaintsController } from "./admin-complaints.controller";
import { ComplaintsController } from "./complaints.controller";
import { MerchantComplaintsController } from "./merchant-complaints.controller";
import { ComplaintsService } from "./complaints.service";
import { ComplaintSlaCronService } from "./complaint-sla-cron.service";

@Module({
  // [I3 fix] ReservationsModule — ComplaintsService.adminRefund calls
  // ReservationsService.refundRedeemed to refund a REDEEMED reservation's
  // payment, the same "import the module for its exported service"
  // pattern modules/offers and modules/merchants already use.
  imports: [EmailModule, ReservationsModule],
  // [Fix round, Critical 1] MerchantComplaintsController MUST be
  // registered before ComplaintsController. Nest registers controllers
  // (and therefore their routes) with the underlying Express router in
  // this array's order, and Express matches routes in registration
  // order regardless of "specificity" — ComplaintsController's
  // `GET /complaints/:id` (complaints.controller.ts) is a DIFFERENT
  // controller than MerchantComplaintsController's literal
  // `GET /complaints/assigned` (@Controller("complaints/assigned")),
  // so if the `:id` controller were registered first, every request to
  // /complaints/assigned would match `:id` with id="assigned" first —
  // permanently 403ing every merchant (that handler is
  // @Actors("CONSUMER")) before MerchantComplaintsController's own
  // handler is ever reached. See complaints-route-order.spec.ts for the
  // regression test (proves which controller method actually handles
  // the request, not just the status code).
  controllers: [
    MerchantComplaintsController,
    ComplaintsController,
    AdminComplaintsController,
  ],
  providers: [ComplaintsService, ComplaintSlaCronService],
})
export class ComplaintsModule {}
