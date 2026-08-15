/**
 * A small set of response-shape aliases still referenced BY NAME outside
 * the hooks that fetch them (component props, a shared status-color map,
 * test fixtures) — e.g. `BagTemplateForm`'s `template?: BagTemplate` prop,
 * or `offerStatus.ts`'s `Record<OfferStatus, StatusTone>`.
 *
 * Until commit e5621a3, `@kurtar/api-client`'s generated `SuccessBody<P,M>`
 * resolved to `Promise<never>` for every operation (a numeric-vs-string
 * literal bug in packages/api-client/src/core-types.ts — see that file's
 * own doc comment), so this file used to hand-duplicate ~15 interfaces
 * field-for-field from the backend DTOs as a workaround, plus an
 * `asResponse<T>()` cast used at every call site. That bug is fixed now:
 * every `client.*` call carries its real, correctly-typed response, so the
 * cast and the hand-duplicated shapes are both gone.
 *
 * What's left below is DERIVED straight off the live `client` — never
 * hand-copied from a DTO — so a real contract change (a field added,
 * removed, or renamed server-side) changes these automatically instead of
 * silently drifting out of sync the way the old hand-typed versions could.
 */
import { client } from "./client";

/** StoreDto */
export type Store = Awaited<
  ReturnType<typeof client.merchant.stores.list>
>[number];

/** BagTemplateDto */
export type BagTemplate = Awaited<
  ReturnType<typeof client.merchant.bagTemplates.list>
>[number];
export type BagCategory = BagTemplate["category"];
export type DietFlag = BagTemplate["dietFlags"][number];

/** OfferMineItemDto */
export type OfferMineItem = Awaited<
  ReturnType<typeof client.offers.listMine>
>[number];
export type OfferStatus = OfferMineItem["status"];

/** MerchantMeResponseDto */
export type MerchantMe = Awaited<ReturnType<typeof client.merchant.getMe>>;

/** SettlementDetailResponseDto — named "...Response" (not just
 * "SettlementDetail") to stay distinct from the `SettlementDetail`
 * component in ./earnings/SettlementDetail.tsx. */
export type SettlementDetailResponse = Awaited<
  ReturnType<typeof client.settlements.getMine>
>;
