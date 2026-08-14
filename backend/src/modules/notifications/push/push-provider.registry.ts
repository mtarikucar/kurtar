import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PushProvider } from "./push-provider.interface";

/**
 * Registry of installed PushProvider adapters, keyed by id. Port of
 * modules/payments-core/payment-provider.registry.ts's exact shape —
 * adapters self-register at module init (see MockPushProvider/
 * ExpoPushProvider's onModuleInit), so requesting an id nothing implements
 * is a clean 404 here rather than a silent no-op.
 */
@Injectable()
export class PushProviderRegistry {
  private readonly logger = new Logger(PushProviderRegistry.name);
  private readonly providers = new Map<string, PushProvider>();

  register(provider: PushProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`PushProvider ${provider.id} re-registered`);
    }
    this.providers.set(provider.id, provider);
    this.logger.log(`Registered PushProvider: ${provider.id}`);
  }

  get(id: string): PushProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new NotFoundException(`Unknown push provider: ${id}`);
    }
    return provider;
  }
}
