import { createHash, randomInt } from "crypto";

/**
 * 6-digit cryptographic OTP. randomInt is a CSPRNG — Math.random is not,
 * and for a code with only 3 verify attempts the distribution bias of
 * Math.random actually matters at scale. Port of kds's
 * backend/src/modules/customers/customers.helpers.ts:generateOtp.
 */
export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * Hash an OTP for at-rest storage. The server secret is mixed in so a DB
 * dump alone is not sufficient to read live codes. Port of kds's
 * customers.helpers.ts:hashOtp — reads JWT_SECRET directly (not via
 * ConfigService) to match kds's own implementation; by the time any
 * request reaches here JWT_SECRET is guaranteed set (JwtStrategy refuses
 * to boot without it — see modules/auth/strategies/jwt.strategy.ts).
 */
export function hashOtp(code: string): string {
  const secret = process.env.JWT_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

/**
 * Constant-time string compare so verifying a hashed OTP doesn't leak
 * timing information about how many leading bytes matched.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
