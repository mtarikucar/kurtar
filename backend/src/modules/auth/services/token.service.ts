import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomBytes, createHash } from "crypto";
import { Prisma, PrincipalType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export interface AuthPrincipal {
  id: string;
  actor: PrincipalType;
  merchantId?: string;
  role?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const DEFAULT_ACCESS_TTL = "15m";
const DEFAULT_REFRESH_TTL = "30d";

type StoredRefreshRow = {
  principalType: PrincipalType;
  userId: string | null;
  merchantUserId: string | null;
  adminUserId: string | null;
  familyId: string;
};

/**
 * TokenService — access/refresh token mint, rotation, and reuse detection.
 * Pattern ported from kds's
 * backend/src/modules/auth/services/token.service.ts, adapted for kurtar's
 * three actor types and for an OPAQUE (not JWT) refresh token:
 *
 *  - kds's refresh token is itself a signed JWT (separate JWT_REFRESH_SECRET),
 *    hashed only for the DB lookup, and needs a `jti` to avoid same-second
 *    collisions (see kds's own comment on that). kurtar's RefreshToken row
 *    already carries its own randomness (32 random bytes, hex-encoded) as
 *    the token value itself — no signing, no collision risk, one less
 *    secret to manage. Only its SHA-256 hash is ever persisted.
 *  - kds revokes EVERY active refresh token for the user on reuse. kurtar's
 *    schema tracks `familyId` per rotation chain (a login = one family), so
 *    reuse only kills that one chain — other active sessions (e.g. a
 *    different device) are unaffected.
 *
 * Reuse-detection race (see auth-refresh-rotation.realdb.spec.ts): when the
 * atomic claim (`UPDATE ... WHERE tokenHash=? AND rotatedAt IS NULL AND
 * revokedAt IS NULL`) succeeds, the successor row is created inside the
 * SAME transaction as the claim. This matters — if the claim and the
 * create were two separate statements, a concurrent second caller could
 * observe "claimed" (rotatedAt already set) after the first statement
 * commits but BEFORE the successor row exists, run its own reuse-driven
 * family revoke, and only afterward see the winner's `create` insert an
 * un-revoked row — a stolen/replayed token would "win" a live session
 * despite reuse having been detected. Wrapping claim+create in one
 * transaction means Postgres holds the row lock for the whole operation,
 * so a blocked concurrent claim only ever unblocks after the successor row
 * is already committed and visible.
 */
@Injectable()
export class TokenService {
  // [B5] Parsed and validated ONCE, here in the constructor, rather than
  // lazily inside refreshTtlMs() on every issueTokens()/refresh() call.
  // parseDurationMs's regex only accepts e.g. "15m"/"30d" — before this
  // fix, a malformed JWT_REFRESH_EXPIRES_IN (e.g. "30days") booted the app
  // successfully and only threw the very first time a user logged in or
  // refreshed, turning a config typo into a 500 discovered by a real user
  // instead of a boot-time failure. Nest instantiates every provider
  // during bootstrap, so throwing here — like JwtStrategy's own
  // constructor check on JWT_SECRET — refuses to boot with a clear
  // message instead.
  private readonly refreshTtlMsCached: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const raw =
      this.configService.get<string>("JWT_REFRESH_EXPIRES_IN") ||
      DEFAULT_REFRESH_TTL;
    this.refreshTtlMsCached = parseDurationMs(raw);
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private signAccessToken(principal: AuthPrincipal): string {
    const payload: Record<string, unknown> = {
      sub: principal.id,
      actor: principal.actor,
    };
    if (principal.merchantId) payload.merchantId = principal.merchantId;
    if (principal.role) payload.role = principal.role;

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>("JWT_SECRET"),
      expiresIn:
        this.configService.get<string>("JWT_EXPIRES_IN") || DEFAULT_ACCESS_TTL,
      algorithm: "HS256",
    });
  }

  private refreshTtlMs(): number {
    return this.refreshTtlMsCached;
  }

  private principalFkColumns(principal: AuthPrincipal) {
    return {
      userId: principal.actor === "CONSUMER" ? principal.id : null,
      merchantUserId: principal.actor === "MERCHANT" ? principal.id : null,
      adminUserId: principal.actor === "ADMIN" ? principal.id : null,
    };
  }

  /** Mint a brand-new access+refresh pair, starting a fresh refresh family. */
  async issueTokens(principal: AuthPrincipal): Promise<IssuedTokens> {
    const familyId = randomBytes(16).toString("hex");
    const rawRefreshToken = randomBytes(32).toString("hex");
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTtlMs());

    await this.prisma.refreshToken.create({
      data: {
        principalType: principal.actor,
        ...this.principalFkColumns(principal),
        tokenHash: this.hashToken(rawRefreshToken),
        familyId,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken: this.signAccessToken(principal),
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Rotate a refresh token. See the class doc for the concurrency
   * reasoning. Reuse of an already-rotated/already-revoked token (or the
   * principal having gone inactive since the token was issued) revokes the
   * ENTIRE family and rejects with a uniform 401.
   */
  async refresh(presentedToken: string): Promise<IssuedTokens> {
    const tokenHash = this.hashToken(presentedToken);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: {
          tokenHash,
          rotatedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { rotatedAt: now },
      });
      if (claimed.count === 0) {
        return { ok: false as const, reason: "claim_failed" as const };
      }

      const stored = await tx.refreshToken.findUniqueOrThrow({
        where: { tokenHash },
      });

      const principal = await this.resolvePrincipal(tx, stored);
      if (!principal) {
        // Principal no longer active/existing — the presented token was
        // legitimately claimable, but minting a fresh session for a
        // banned/deleted/deactivated account would be wrong. Kill the
        // family here (inside the same commit) rather than leaving the
        // claimed-but-superseded row as the only casualty.
        await tx.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { ok: false as const, reason: "inactive" as const };
      }

      const rawRefreshToken = randomBytes(32).toString("hex");
      const refreshTokenExpiresAt = new Date(
        now.getTime() + this.refreshTtlMs(),
      );

      await tx.refreshToken.create({
        data: {
          principalType: stored.principalType,
          userId: stored.userId,
          merchantUserId: stored.merchantUserId,
          adminUserId: stored.adminUserId,
          tokenHash: this.hashToken(rawRefreshToken),
          familyId: stored.familyId,
          expiresAt: refreshTokenExpiresAt,
        },
      });

      return {
        ok: true as const,
        principal,
        rawRefreshToken,
        refreshTokenExpiresAt,
      };
    });

    if (!result.ok) {
      if (result.reason === "claim_failed") {
        await this.handleClaimFailure(tokenHash, now);
      }
      throw new UnauthorizedException("Invalid refresh token");
    }

    return {
      accessToken: this.signAccessToken(result.principal),
      refreshToken: result.rawRefreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
    };
  }

  /**
   * The atomic claim failed. Figure out why (purely diagnostic — the
   * outcome is always a 401) and, when it means genuine reuse of an
   * already-rotated/revoked token, family-revoke.
   */
  private async handleClaimFailure(
    tokenHash: string,
    now: Date,
  ): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored) return; // Unknown token — nothing to revoke.
    if (stored.expiresAt <= now) return; // Naturally expired, not reuse.

    // Found, not expired, claim still failed -> already rotated or
    // revoked. Reuse detected: kill the whole family.
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async resolvePrincipal(
    tx: Prisma.TransactionClient,
    stored: StoredRefreshRow,
  ): Promise<AuthPrincipal | null> {
    if (stored.principalType === "CONSUMER") {
      const user = await tx.user.findUnique({
        where: { id: stored.userId! },
        select: { id: true, status: true },
      });
      if (!user || user.status !== "ACTIVE") return null;
      return { id: user.id, actor: "CONSUMER" };
    }

    if (stored.principalType === "MERCHANT") {
      const merchantUser = await tx.merchantUser.findUnique({
        where: { id: stored.merchantUserId! },
        select: { id: true, merchantId: true, role: true },
      });
      if (!merchantUser) return null;
      return {
        id: merchantUser.id,
        actor: "MERCHANT",
        merchantId: merchantUser.merchantId,
        role: merchantUser.role,
      };
    }

    const adminUser = await tx.adminUser.findUnique({
      where: { id: stored.adminUserId! },
      select: { id: true, active: true },
    });
    if (!adminUser || !adminUser.active) return null;
    return { id: adminUser.id, actor: "ADMIN" };
  }

  /** Revoke the entire refresh family the presented token belongs to. */
  async revokeFamilyByToken(presentedToken: string): Promise<void> {
    const tokenHash = this.hashToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Parses "15m" / "30d" style durations (seconds/minutes/hours/days). */
function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${input}" — expected e.g. "15m" or "30d".`,
    );
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[match[2]];
}
