import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Nest wrapper around the generated Prisma client. Connects eagerly on
 * module init rather than lazily on first query, so a broken DATABASE_URL
 * fails loudly at boot instead of on the first request.
 *
 * Disconnect is driven by Nest's module lifecycle
 * (OnModuleDestroy -> $disconnect), which fires on SIGTERM/SIGINT because
 * main.ts calls `app.enableShutdownHooks()` — no extra `beforeExit` process
 * hook needed here.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Query-level logging includes bound parameters — password hashes, OTP
    // codes, refresh-token hashes all flow through Prisma verbatim. Gated
    // behind an explicit opt-in flag (never honored in production) rather
    // than NODE_ENV=development, so a misconfigured environment can't leak
    // secrets into logs by accident.
    const enableQueryLogs =
      process.env.PRISMA_LOG_QUERIES === "true" &&
      process.env.NODE_ENV !== "production";

    super({
      log: enableQueryLogs ? ["query", "error", "warn"] : ["error", "warn"],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
