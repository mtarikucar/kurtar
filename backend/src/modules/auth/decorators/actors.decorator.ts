import { SetMetadata } from "@nestjs/common";
import { PrincipalType } from "@prisma/client";

/**
 * Restrict a route to one or more actor types, e.g.
 * `@Actors('ADMIN', 'MERCHANT')`. Enforced by ActorsGuard. A route with no
 * `@Actors()` annotation is open to any authenticated actor (JwtAuthGuard
 * already requires a valid token; ActorsGuard only narrows further).
 */
export const ACTORS_KEY = "actors";
export const Actors = (...actors: PrincipalType[]) =>
  SetMetadata(ACTORS_KEY, actors);
