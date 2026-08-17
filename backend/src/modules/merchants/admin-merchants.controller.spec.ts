import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ActorsGuard } from "../auth/guards/actors.guard";
import { AdminMerchantsController } from "./admin-merchants.controller";

/**
 * [Admin KYC detail] Proof that GET /admin/merchants/:id (getDetail)
 * genuinely cannot be reached by a MERCHANT or CONSUMER — not by
 * re-mocking ActorsGuard's metadata (actors.guard.spec.ts already proves
 * the guard's own rejection LOGIC generically), but by running the REAL
 * guard against the REAL @Actors("ADMIN") metadata this controller
 * actually carries. Reflector.getAllAndOverride checks the handler
 * first, then falls back to the class — getDetail has no method-level
 * @Actors() override of its own, so this also proves the fallback to
 * the class-level decorator resolves correctly for this specific route,
 * not just in the abstract.
 */
function ctx(user?: { id: string; actor: string }): ExecutionContext {
  return {
    getHandler: () => AdminMerchantsController.prototype.getDetail,
    getClass: () => AdminMerchantsController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("AdminMerchantsController.getDetail — actor scoping (real metadata, real guard)", () => {
  const guard = new ActorsGuard(new Reflector());

  it("rejects a MERCHANT with 403", () => {
    expect(() =>
      guard.canActivate(ctx({ id: "mu1", actor: "MERCHANT" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects a CONSUMER with 403", () => {
    expect(() =>
      guard.canActivate(ctx({ id: "u1", actor: "CONSUMER" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects an unauthenticated request with 403", () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it("allows an ADMIN", () => {
    expect(guard.canActivate(ctx({ id: "a1", actor: "ADMIN" }))).toBe(true);
  });
});
