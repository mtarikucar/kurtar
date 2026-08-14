import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from "@nestjs/common";
import { AuthenticatedPrincipal } from "../strategies/jwt.strategy";

/**
 * Read the authenticated principal (or a field of it) off the request.
 * Fails loudly when the route has no active auth guard — propagating
 * `undefined` downstream would produce a misleading Prisma/null error
 * instead of a clear signal that the route is missing a guard.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedPrincipal | undefined = request.user;
    if (!user) {
      throw new InternalServerErrorException(
        "CurrentUser used on a route without an active auth guard",
      );
    }
    return data ? user[data] : user;
  },
);
