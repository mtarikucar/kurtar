import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EDocumentProvider } from "./e-document-provider.interface";

/**
 * Registry of installed EDocumentProvider adapters, keyed by id — mirrors
 * payments-core/payment-provider.registry.ts exactly. NilveraAdapter only
 * self-registers when NILVERA_API_KEY/NILVERA_API_URL are both configured
 * (see that adapter's doc comment), so requesting "nilvera" without those
 * set is a clean 404 here, never a silent no-op or a runtime crash deep
 * inside issue().
 */
@Injectable()
export class EDocumentProviderRegistry {
  private readonly logger = new Logger(EDocumentProviderRegistry.name);
  private readonly providers = new Map<string, EDocumentProvider>();

  register(provider: EDocumentProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`EDocumentProvider ${provider.id} re-registered`);
    }
    this.providers.set(provider.id, provider);
    this.logger.log(`Registered EDocumentProvider: ${provider.id}`);
  }

  get(id: string): EDocumentProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new NotFoundException(`Unknown e-document provider: ${id}`);
    }
    return provider;
  }
}
