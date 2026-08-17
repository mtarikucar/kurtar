import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EDocumentProviderRegistry } from "./e-document-provider.registry";
import {
  EDocumentInvoiceInput,
  EDocumentIssueResult,
  EDocumentProvider,
} from "./e-document-provider.interface";
import { ValidEDocProvider } from "../../config/env.validation";

/** Provider-neutral façade — mirrors payments-core/payments-facade.service.ts
 * exactly (lazy per-call resolution, same reasoning). */
@Injectable()
export class EDocumentFacadeService {
  constructor(
    private readonly registry: EDocumentProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  activeProviderId(): ValidEDocProvider {
    return (
      (this.configService.get<string>("EDOC_PROVIDER") as ValidEDocProvider) ||
      "mock"
    );
  }

  private activeProvider(): EDocumentProvider {
    return this.registry.get(this.activeProviderId());
  }

  async issue(invoice: EDocumentInvoiceInput): Promise<EDocumentIssueResult> {
    return this.activeProvider().issue(invoice);
  }

  async healthCheck() {
    return this.activeProvider().healthCheck();
  }
}
