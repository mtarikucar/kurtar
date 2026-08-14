import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrincipalType } from "@prisma/client";
import { ACTORS_KEY } from "../decorators/actors.decorator";
import { AuthenticatedPrincipal } from "../strategies/jwt.strategy";

/**
 * Enforces `@Actors(...)`. Runs after JwtAuthGuard (registration order in
 * AuthModule), so `request.user` is already populated for any route this
 * guard actually evaluates — @Public() routes never reach here because
 * JwtAuthGuard already returned true for them without running Passport,
 * and non-public routes are guaranteed authenticated by the time this
 * guard's canActivate runs (Nest evaluates APP_GUARDs in registration
 * order, all against the same request).
 */
@Injectable()
export class ActorsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredActors = this.reflector.getAllAndOverride<PrincipalType[]>(
      ACTORS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredActors || requiredActors.length === 0) {
      return true;
    }

    const { user }: { user?: AuthenticatedPrincipal } = context
      .switchToHttp()
      .getRequest();

    if (!user) {
      throw new ForbiddenException("Not authenticated");
    }

    if (!requiredActors.includes(user.actor)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
