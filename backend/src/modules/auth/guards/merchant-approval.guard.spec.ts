import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MerchantApprovalGuard } from "./merchant-approval.guard";

function ctx(user?: {
  id: string;
  actor: string;
  merchantVerificationStatus?: string;
}): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("MerchantApprovalGuard", () => {
  it("allows an APPROVED merchant", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const guard = new MerchantApprovalGuard(reflector);

    expect(
      guard.canActivate(
        ctx({
          id: "mu1",
          actor: "MERCHANT",
          merchantVerificationStatus: "APPROVED",
        }),
      ),
    ).toBe(true);
  });

  it.each(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED", "SUSPENDED"])(
    "rejects a %s merchant with 403 MERCHANT_NOT_APPROVED",
    (status) => {
      const reflector = new Reflector();
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
      const guard = new MerchantApprovalGuard(reflector);

      let thrown: unknown;
      try {
        guard.canActivate(
          ctx({
            id: "mu1",
            actor: "MERCHANT",
            merchantVerificationStatus: status,
          }),
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown as ForbiddenException).getResponse()).toMatchObject({
        errorCode: "MERCHANT_NOT_APPROVED",
      });
    },
  );

  it("is a no-op (allows) when @AllowUnapprovedMerchant() is present, even for a non-APPROVED merchant", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);
    const guard = new MerchantApprovalGuard(reflector);

    expect(
      guard.canActivate(
        ctx({
          id: "mu1",
          actor: "MERCHANT",
          merchantVerificationStatus: "SUSPENDED",
        }),
      ),
    ).toBe(true);
  });

  it("is a no-op for a non-MERCHANT actor (CONSUMER), regardless of the metadata", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const guard = new MerchantApprovalGuard(reflector);

    expect(guard.canActivate(ctx({ id: "u1", actor: "CONSUMER" }))).toBe(true);
  });

  it("is a no-op for a non-MERCHANT actor (ADMIN)", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const guard = new MerchantApprovalGuard(reflector);

    expect(guard.canActivate(ctx({ id: "a1", actor: "ADMIN" }))).toBe(true);
  });

  it("is a no-op when there is no authenticated user at all (JwtAuthGuard/ActorsGuard's job, not this guard's)", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    const guard = new MerchantApprovalGuard(reflector);

    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });
});
