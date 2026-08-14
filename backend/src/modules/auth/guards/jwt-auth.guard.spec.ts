import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Spec for JwtAuthGuard's @Public bypass. When @Public is present the guard
 * short-circuits to true WITHOUT invoking passport; otherwise it delegates
 * to the passport AuthGuard('jwt'). Port of kds's
 * backend/src/modules/auth/guards/jwt-auth.guard.spec.ts.
 */
function ctx(): ExecutionContext {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  it("bypasses passport (returns true) for a @Public route", () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockImplementation((key: unknown) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      );
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it("delegates to the passport AuthGuard for a protected route", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const guard = new JwtAuthGuard(reflector);
    // super.canActivate returns a value/observable/promise from passport
    // rather than the literal `true` of the bypass branch. Spy on the
    // prototype to confirm delegation without booting a real strategy.
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), "canActivate")
      .mockReturnValue("delegated" as unknown as boolean);
    const result = guard.canActivate(ctx());
    expect(superSpy).toHaveBeenCalled();
    expect(result).toBe("delegated");
    superSpy.mockRestore();
  });
});
