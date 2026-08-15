import type { PlatformPricing } from "../api/admin-types";

/**
 * `GET /admin/pricing` (PricingService.listPricing) returns every pricing
 * row ordered `effectiveFrom: "desc"` — the FIRST item is not necessarily
 * "currently in effect": an admin can schedule a FUTURE price change
 * (PricingService.scheduleFuturePricing always requires `effectiveFrom` in
 * the future), which would then sort ahead of the row that's actually
 * live today. This picks the first row (in that same desc order) whose
 * `effectiveFrom` is at or before `now` — the same "most recent row not
 * later than the reference instant" rule
 * `PricingService.resolvePlatformPricing` uses server-side for settlement
 * computation (backend/src/modules/settlements/pricing.service.ts).
 */
export function pickCurrentPricing(
  items: PlatformPricing[],
  now: Date = new Date(),
): PlatformPricing | null {
  const nowMs = now.getTime();
  for (const item of items) {
    if (new Date(item.effectiveFrom).getTime() <= nowMs) return item;
  }
  return null;
}

/** Every row with `effectiveFrom` strictly after `now` — a scheduled but
 * not-yet-live price change. */
export function futurePricing(
  items: PlatformPricing[],
  now: Date = new Date(),
): PlatformPricing[] {
  const nowMs = now.getTime();
  return items.filter((item) => new Date(item.effectiveFrom).getTime() > nowMs);
}
