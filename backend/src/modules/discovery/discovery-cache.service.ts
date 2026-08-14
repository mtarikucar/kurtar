import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Tiny get/set wrapper around ioredis for the discovery offers-list cache
 * (modules/discovery/discovery.service.ts). The one property that matters
 * more than anything else here: Redis being down must NEVER turn into a
 * 500 for a discovery request — every method below swallows its own
 * errors and returns a "miss"/no-op instead, logging a warning exactly
 * ONCE (not once per request — a Redis outage under real traffic would
 * otherwise flood the logs) so an operator still finds out.
 *
 * `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` are the two
 * settings that make ioredis fail FAST while disconnected rather than
 * queuing commands indefinitely waiting for a reconnect — queued commands
 * would otherwise make a "degrade immediately" cache into a "hang until
 * timeout" one, which is worse than no cache at all.
 */
@Injectable()
export class DiscoveryCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoveryCacheService.name);
  private client: Redis | null = null;
  private warnedOnce = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.warnOnce(
        "REDIS_URL is not configured — discovery cache disabled, serving uncached.",
      );
      return;
    }

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on("error", (err) =>
      this.warnOnce(`Redis error — serving discovery uncached: ${err.message}`),
    );
    this.client
      .connect()
      .catch((err) =>
        this.warnOnce(
          `Redis connect failed — serving discovery uncached: ${(err as Error).message}`,
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
        `Redis GET failed — serving discovery uncached: ${(err as Error).message}`,
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
        `Redis SET failed — serving discovery uncached: ${(err as Error).message}`,
      );
    }
  }
}
