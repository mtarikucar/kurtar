import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PushProviderRegistry } from "./push-provider.registry";
import {
  PushMessage,
  PushProvider,
  PushSendResult,
} from "./push-provider.interface";
import { ValidPushProvider } from "../../../config/env.validation";

/**
 * Provider-neutral façade. Business code (PushDispatchService, the outbox
 * handlers) depends on this, never a concrete adapter. Port of
 * modules/payments-core/payments-facade.service.ts's exact shape: the
 * active provider is resolved LAZILY per call from PUSH_PROVIDER (default
 * "mock"), not cached at construction — adapters register themselves in
 * their own onModuleInit, which Nest runs after every provider's
 * constructor across the whole module graph, so resolving eagerly here
 * would race that.
 */
@Injectable()
export class PushFacadeService {
  constructor(
    private readonly registry: PushProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  activeProviderId(): ValidPushProvider {
    return (
      (this.configService.get<string>("PUSH_PROVIDER") as ValidPushProvider) ||
      "mock"
    );
  }

  private activeProvider(): PushProvider {
    return this.registry.get(this.activeProviderId());
  }

  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (messages.length === 0) return [];
    return this.activeProvider().sendBatch(messages);
  }
}
