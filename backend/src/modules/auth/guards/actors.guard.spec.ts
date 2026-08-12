import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ActorsGuard } from "./actors.guard";

function ctx(user?: { id: string; actor: string }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("ActorsGuard", () => {
  it("allows any authenticated actor when no @Actors() metadata is present", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new ActorsGuard(reflector);

    expect(guard.canActivate(ctx({ id: "u1", actor: "CONSUMER" }))).toBe(true);
  });

  it("allows a request whose actor is in the required list", () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue(["ADMIN", "MERCHANT"]);
    const guard = new ActorsGuard(reflector);

    expect(guard.canActivate(ctx({ id: "mu1", actor: "MERCHANT" }))).toBe(true);
  });

  it("rejects with 403 when the actor is not in the required list", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ADMIN"]);
    const guard = new ActorsGuard(reflector);

    expect(() =>
      guard.canActivate(ctx({ id: "u1", actor: "CONSUMER" })),
    ).toThrow(ForbiddenException);
  });

  it("rejects with 403 when there is no authenticated user at all", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["ADMIN"]);
    const guard = new ActorsGuard(reflector);

    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
