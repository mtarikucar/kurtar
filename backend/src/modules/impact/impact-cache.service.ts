import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Redis get/set wrapper for the public impact aggregate
 * (modules/impact/impact.service.ts's getPublic — brief §3: "served from
 * a Redis-cached aggregate, TTL 5 min, graceful degradation like the
 * discovery cache"). Deliberately its OWN small class rather than
 * importing DiscoveryModule's DiscoveryCacheService cross-domain — same
 * shape (own ioredis client, `enableOfflineQueue:false` +
 * `maxRetriesPerRequest:1` so a Redis outage fails FAST instead of
 * queuing, `warnOnce` so an outage logs exactly once, not once per
 * request), ported deliberately rather than shared, mirroring how this
 * codebase already gives each provider-seam module (push/email/payments)
 * its own small dedicated service instead of one shared base class. A
 * Redis outage here NEVER turns GET /api/impact/public into a 500 — every
 * method below swallows its own errors and returns "miss"/no-op instead.
 */
@Injectable()
export class ImpactCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImpactCacheService.name);
  private client: Redis | null = null;
  private warnedOnce = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.warnOnce(
        "REDIS_URL is not configured — impact cache disabled, serving uncached.",
      );
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on("error", (err) =>
      this.warnOnce(`Redis error — serving impact uncached: ${err.message}`),
    );
    this.client
      .connect()
      .catch((err) =>
        this.warnOnce(
          `Redis connect failed — serving impact uncached: ${(err as Error).message}`,
        ),
      );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await this.client.quit().catch(() => undefined);
  }

  private warnOnce(message: string): void {
    if (this.warnedOnce) return;
    this.warnedOnce = true;
    this.logger.warn(message);
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.warnOnce(
        `Redis GET failed — serving impact uncached: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.warnOnce(
        `Redis SET failed — serving impact uncached: ${(err as Error).message}`,
      );
    }
  }
}
