import { Global, Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";

/**
 * The producer-side seam, split from OutboxModule (the drain worker +
 * handler registry + handlers) exactly like PaymentsCoreModule is split
 * from PaymentsModule — every producer (offers, reservations, payments,
 * merchants) needs OutboxService.publish(tx, ...) but none of them need
 * the worker/handlers, and importing the FULL OutboxModule (which pulls in
 * PushModule/EmailModule) into every producer module would be needless
 * coupling. @Global, so any module can inject OutboxService without an
 * explicit import, mirroring PrismaModule/PaymentsCoreModule.
 */
@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxCoreModule {}
