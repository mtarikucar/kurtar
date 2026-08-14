import { Prisma } from "@prisma/client";

/**
 * True when `error` is Prisma's unique-constraint-violation error (P2002),
 * optionally narrowed to a specific column. Shared by every collision-
 * retry / create-first-dedup path in the payments/reservations modules
 * (reservation code generation, WebhookEventLog dedup) so each call site
 * doesn't hand-roll its own `error.code === "P2002"` check.
 */
export function isUniqueConstraintViolation(
  error: unknown,
  target?: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  if (!target) return true;
  const meta = error.meta?.target;
  if (typeof meta === "string") return meta === target;
  if (Array.isArray(meta)) return meta.includes(target);
  return false;
}
