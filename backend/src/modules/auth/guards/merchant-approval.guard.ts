import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ALLOW_UNAPPROVED_MERCHANT_KEY } from "../decorators/allow-unapproved-merchant.decorator";
import { AuthenticatedPrincipal } from "../strategies/jwt.strategy";

/**
 * Default-deny gate for MERCHANT actors: every request from a MERCHANT
 * principal is rejected (403 MERCHANT_NOT_APPROVED) unless
 * `merchantVerificationStatus === 'APPROVED'`, UNLESS the route carries
 * `@AllowUnapprovedMerchant()` (decorators/allow-unapproved-merchant.decorator.ts
 * explains why this is the opt-OUT direction, not opt-in).
 *
 * Runs after JwtAuthGuard (populates request.user) and ActorsGuard
 * (registration order in AuthModule) — a no-op for CONSUMER/ADMIN
 * requests and for any route with no authenticated user at all (those are
 * JwtAuthGuard/ActorsGuard's job to reject, not this guard's).
 *
 * This is now the SINGLE enforcement point for "does this merchant action
 * require an APPROVED account" — the ad-hoc verificationStatus check that
 * used to live only in StoresService.create() (and nowhere else, which is
 * exactly how a SUSPENDED merchant could still create bag templates,
 * publish offers, and re-toggle a store back to active) has been removed
 * in favor of this one guard covering every current AND future
 * MERCHANT-actor route by default.
 */
@Injectable()
export class MerchantApprovalGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowUnapproved = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNAPPROVED_MERCHANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowUnapproved) return true;

    const { user }: { user?: AuthenticatedPrincipal } = context
      .switchToHttp()
      .getRequest();
    if (!user || user.actor !== "MERCHANT") return true;

    if (user.merchantVerificationStatus !== "APPROVED") {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: "MERCHANT_NOT_APPROVED",
        message: "This action requires an APPROVED merchant account.",
      });
    }
    return true;
  }
}
