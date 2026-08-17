import { Reflector } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";

/**
 * Route-wiring regression spec. Caught a real bug during live verification
 * (Task 3): POST /auth/logout had no @Public(), so JwtAuthGuard (global)
 * demanded a valid BEARER ACCESS TOKEN on top of the refresh token logout
 * actually operates on — a client whose 15m access token had already
 * expired (a completely normal case for a long-idle session with a still-
 * valid 30d refresh token) got a 401 and could never log out without first
 * calling /refresh. Pins every route's intended public/protected status so
 * a future edit can't silently regress this class of bug again.
 */
describe("AuthController — route @Public() wiring", () => {
  const reflector = new Reflector();

  function isPublic(methodName: keyof AuthController): boolean {
    const handler = AuthController.prototype[methodName];
    return (
      reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler]) === true
    );
  }

  it.each([
    ["requestOtp", true],
    ["verifyOtp", true],
    ["merchantLogin", true],
    ["adminLogin", true],
    // One refresh + one logout route PER ACTOR (the cross-actor
    // session-bleed fix — see refresh-cookie-transport.util.ts). Every
    // one of them must carry @Public() individually; a new actor route
    // added without it regresses exactly the bug this spec pins.
    ["refreshConsumer", true],
    ["refreshMerchant", true],
    ["refreshAdmin", true],
    // logout is keyed purely off the presented refresh token (cookie or
    // body) — never off the authenticated principal — so it must stay
    // reachable even with an expired/absent access token.
    ["logoutConsumer", true],
    ["logoutMerchant", true],
    ["logoutAdmin", true],
  ] as const)("%s is @Public(): %p", (method, expected) => {
    expect(isPublic(method)).toBe(expected);
  });
});
