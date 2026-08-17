import { Injectable } from "@nestjs/common";
import { NilveraAdapter } from "./adapters/nilvera.adapter";

/**
 * The "mükellef-lookup provider hook" the brief describes (§6): whether a
 * merchant's VKN is a REGISTERED e-Fatura user decides EFATURA vs
 * EARSIVFATURA. The hook genuinely exists (delegates to
 * NilveraAdapter.isRegisteredEFaturaUser) — but that method itself always
 * returns `null` ("unknown") whenever NilveraAdapter isn't configured
 * (NILVERA_API_KEY/NILVERA_API_URL), which is every environment this task
 * runs in. So today, `checkIsEFaturaUser` ALWAYS resolves `null` in
 * practice, and commission-invoice.service.ts's documented policy for
 * `null` (same as a definite `false`) is EARSIVFATURA — "unknown ⇒
 * EARSIVFATURA for now", exactly as the brief specifies. Once Nilvera is
 * actually configured, this hook starts returning real answers with zero
 * code change on the calling side.
 */
@Injectable()
export class TaxpayerLookupService {
  constructor(private readonly nilvera: NilveraAdapter) {}

  async checkIsEFaturaUser(taxId: string): Promise<boolean | null> {
    return this.nilvera.isRegisteredEFaturaUser(taxId);
  }
}
