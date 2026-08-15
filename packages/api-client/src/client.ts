import { createRequestEngine } from "./engine";
import type { CreateClientOptions } from "./transport";
import { createAuthDomain } from "./domains/auth";
import { createHealthDomain } from "./domains/health";
import { createMerchantDomain } from "./domains/merchant";
import { createOffersDomain } from "./domains/offers";
import { createDiscoveryDomain } from "./domains/discovery";
import { createReservationsDomain } from "./domains/reservations";
import { createComplaintsDomain } from "./domains/complaints";
import { createAdminDomain } from "./domains/admin";
import { createImpactDomain } from "./domains/impact";
import { createFavoritesDomain } from "./domains/favorites";
import { createRatingsDomain } from "./domains/ratings";
import { createSettlementsDomain } from "./domains/settlements";
import { createAccountDomain } from "./domains/account";

export interface KurtarClient {
  health: ReturnType<typeof createHealthDomain>;
  auth: ReturnType<typeof createAuthDomain>;
  merchant: ReturnType<typeof createMerchantDomain>;
  offers: ReturnType<typeof createOffersDomain>;
  discovery: ReturnType<typeof createDiscoveryDomain>;
  reservations: ReturnType<typeof createReservationsDomain>;
  complaints: ReturnType<typeof createComplaintsDomain>;
  admin: ReturnType<typeof createAdminDomain>;
  impact: ReturnType<typeof createImpactDomain>;
  favorites: ReturnType<typeof createFavoritesDomain>;
  ratings: ReturnType<typeof createRatingsDomain>;
  settlements: ReturnType<typeof createSettlementsDomain>;
  account: ReturnType<typeof createAccountDomain>;
}

/**
 * Builds a fully-typed kurtar API client. See docs/frontend-contract.md for
 * the full usage guide (transport rule per surface, auth flows, error-code
 * catalogue). Deliberately NOT a class — a plain object of plain functions
 * closing over one shared `RequestEngine`, so it needs no `this` binding
 * gymnastics in React event handlers or RN callbacks.
 *
 * Not covered here: `POST /webhooks/payment` — a server-to-server payment
 * provider webhook, never called by any of the four frontend apps.
 */
export function createClient(options: CreateClientOptions): KurtarClient {
  const engine = createRequestEngine(options);

  return {
    health: createHealthDomain(engine),
    auth: createAuthDomain(engine, options.transport),
    merchant: createMerchantDomain(engine, options.transport),
    offers: createOffersDomain(engine),
    discovery: createDiscoveryDomain(engine),
    reservations: createReservationsDomain(engine),
    complaints: createComplaintsDomain(engine),
    admin: createAdminDomain(engine),
    impact: createImpactDomain(engine),
    favorites: createFavoritesDomain(engine),
    ratings: createRatingsDomain(engine),
    settlements: createSettlementsDomain(engine),
    account: createAccountDomain(engine),
  };
}
