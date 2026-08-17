import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import { TokenService } from "./services/token.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Real-DB concurrency proof for TokenService's refresh rotation. Only runs
 * when TEST_DATABASE_URL is set (Task 2's realdb gate pattern). Exercises
 * the actual Postgres row-locking behavior the mocked unit spec
 * (services/token.service.spec.ts) cannot: two genuinely parallel
 * connections racing an UPDATE against the same row.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

d("TokenService.refresh — real DB concurrency", () => {
  let prisma: PrismaClient;
  let tokenService: TokenService;
  let userId: string;

  const config = {
    get: (key: string) =>
      ({
        JWT_SECRET: "realdb-test-secret",
        JWT_EXPIRES_IN: "15m",
        JWT_REFRESH_EXPIRES_IN: "30d",
      })[key],
  } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const jwtService = new JwtService({ secret: "realdb-test-secret" });
    tokenService = new TokenService(
      prisma as unknown as PrismaService,
      jwtService,
      config,
    );

    const user = await prisma.user.create({
      data: {
        phoneE164: `+9055501${Date.now().toString().slice(-5)}`,
        status: "ACTIVE",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  async function seedFamily(): Promise<{ familyId: string; rawToken: string }> {
    const familyId = randomBytes(16).toString("hex");
    const rawToken = randomBytes(32).toString("hex");
    await prisma.refreshToken.create({
      data: {
        principalType: "CONSUMER",
        userId,
        tokenHash: hashToken(rawToken),
        familyId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      },
    });
    return { familyId, rawToken };
  }

  it("exactly one of two parallel refresh calls on the same token succeeds", async () => {
    const { familyId, rawToken } = await seedFamily();

    const results = await Promise.allSettled([
      tokenService.refresh(rawToken, "CONSUMER"),
      tokenService.refresh(rawToken, "CONSUMER"),
    ]);

    const fulfilled = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof tokenService.refresh>>
      > => r.status === "fulfilled",
    );
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.refreshToken).not.toBe(rawToken);
    expect(fulfilled[0].value.accessToken).toEqual(expect.any(String));

    // The race is itself treated as reuse of the not-yet-rotated old
    // token — see TokenService's class doc for why this is the correct,
    // standard threat model (the server cannot distinguish a legitimate
    // double-fire from an attacker racing a stolen token). The whole
    // family — the original row AND the winner's freshly minted
    // successor — ends up revoked as a result.
    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows).toHaveLength(2); // original + the winner's one successor
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("reusing an already-rotated token revokes the entire family, including tokens issued after it", async () => {
    const { familyId, rawToken } = await seedFamily();

    const first = await tokenService.refresh(rawToken, "CONSUMER");
    expect(first.refreshToken).not.toBe(rawToken);

    // Replay the ORIGINAL (now-rotated) token — classic reuse.
    await expect(tokenService.refresh(rawToken, "CONSUMER")).rejects.toThrow(
      /Invalid refresh token/,
    );

    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

    // The successor minted by the legitimate first refresh is dead too —
    // reuse anywhere in a family kills the whole chain, not just the
    // replayed token's own row.
    await expect(
      tokenService.refresh(first.refreshToken, "CONSUMER"),
    ).rejects.toThrow(/Invalid refresh token/);
  });
});
