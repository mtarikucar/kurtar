/**
 * [Task 9 brief §3] "TGTG uses ~2.5 kg CO2e per bag; use 2500 [grams] and
 * make it configurable." This is the DEFAULT — ImpactLedgerHandler reads
 * `CO2E_PER_BAG_GRAMS` from ConfigService (falling back to this constant)
 * so an operator can tune the figure without a code change/redeploy as
 * better local data becomes available, without ever hand-typing 2500 a
 * second time anywhere else in the codebase.
 */
export const CO2E_PER_BAG_GRAMS_DEFAULT = 2500;
