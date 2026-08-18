import openapiSpec from "../../../docs/openapi.json";
import { createClient, type KurtarClient } from "../src/client";

/**
 * Regression coverage for the bug class the coordinator's round found
 * (`ratings.listMine()` and `offers.listMine()` silently took NO
 * parameters at all, dropping every query param the endpoint accepts —
 * a swept audit found 8 affected methods total, now all fixed). This
 * ISN'T a type-level bug (a method with zero parameters typechecks just
 * fine as its own thing) — TypeScript alone can't catch "this function
 * should accept a parameter it doesn't," only a check against the real
 * CONTRACT can. So `queryBearingOperations()` below derives its list
 * LIVE from the committed `docs/openapi.json`, not a hand-copied list:
 * the "has a coverage entry for every ..." test fails loudly the moment
 * a FUTURE contract change adds a query param to any endpoint (existing
 * or brand new) before anyone remembers to wire it into `COVERAGE` below
 * and prove it's actually forwarded.
 */

interface QueryBearingOperation {
  operationId: string;
  method: string;
  path: string;
  queryParamNames: string[];
}

function queryBearingOperations(): QueryBearingOperation[] {
  const results: QueryBearingOperation[] = [];
  for (const [path, methods] of Object.entries(openapiSpec.paths)) {
    for (const [method, operation] of Object.entries(
      methods as Record<
        string,
        {
          operationId?: string;
          parameters?: Array<{ in: string; name: string }>;
        }
      >,
    )) {
      if (!operation.operationId) continue;
      const queryParams = (operation.parameters ?? []).filter(
        (p) => p.in === "query",
      );
      if (queryParams.length > 0) {
        results.push({
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path,
          queryParamNames: queryParams.map((p) => p.name),
        });
      }
    }
  }
  return results;
}

/**
 * One entry per query-bearing operationId — a function that calls the
 * client with a representative, non-empty value for EVERY query param
 * the operation declares (required AND optional), so the test below can
 * assert every single one of them actually lands on the request URL.
 */
const COVERAGE: Record<string, (client: KurtarClient) => Promise<unknown>> = {
  ReservationsController_listMine: (c) =>
    c.reservations.listMine({ page: 1, pageSize: 20 }),
  ReservationsController_listForMerchant: (c) =>
    c.reservations.listForMerchant({
      storeId: "store_1",
      offerId: "offer_1",
      date: "2026-08-20",
      status: ["CONFIRMED", "REDEEMED"],
      page: 1,
      pageSize: 20,
    }),
  BagTemplatesController_list: (c) =>
    c.merchant.bagTemplates.list({ storeId: "store_1" }),
  OffersController_listMine: (c) => c.offers.listMine({ date: "2026-08-20" }),
  AdminMerchantsController_list: (c) =>
    c.admin.merchants.list({ status: "SUBMITTED", page: 1, pageSize: 20 }),
  DiscoveryController_offers: (c) =>
    c.discovery.offers({
      category: "MEAL",
      lat: 41.0082,
      lng: 28.9784,
      radiusM: 1500,
      diet: "vegan",
      pickupAfter: "18:00",
      pickupBefore: "20:00",
      q: "ekmek",
      page: 1,
      pageSize: 20,
    }),
  DiscoveryController_map: (c) =>
    c.discovery.map({
      category: "BAKERY",
      west: 28.9,
      south: 40.9,
      east: 29.1,
      north: 41.1,
    }),
  AdminSettlementsController_list: (c) =>
    c.admin.settlements.list({
      status: "PENDING",
      merchantId: "m_1",
      page: 1,
      pageSize: 20,
    }),
  AdminInvoicesController_list: (c) =>
    c.admin.invoices.list({
      status: "DRAFT",
      merchantId: "m_1",
      page: 1,
      pageSize: 20,
    }),
  SettlementsController_listMine: (c) =>
    c.settlements.listMine({ page: 1, pageSize: 20 }),
  MyFavoritesController_listMine: (c) =>
    c.favorites.listMine({ page: 1, pageSize: 20 }),
  RatingsController_listMine: (c) =>
    c.ratings.listMine({ storeId: "store_1", page: 1, pageSize: 20 }),
  AdminRatingsController_list: (c) =>
    c.admin.ratings.list({
      status: "PENDING",
      storeId: "store_1",
      page: 1,
      pageSize: 20,
    }),
  MerchantComplaintsController_listAssigned: (c) =>
    c.complaints.listAssigned({ status: "OPEN", page: 1, pageSize: 20 }),
  ComplaintsController_listMine: (c) =>
    c.complaints.listMine({ status: "OPEN", page: 1, pageSize: 20 }),
  AdminComplaintsController_list: (c) =>
    c.admin.complaints.list({
      status: "OPEN",
      category: "FOOD_QUALITY",
      merchantId: "m_1",
      page: 1,
      pageSize: 20,
    }),
  AdminReportsController_list: (c) =>
    c.admin.reports.list({
      status: "OPEN",
      targetType: "STORE",
      page: 1,
      pageSize: 20,
    }),
  AdminExportsController_complaintsCsv: (c) =>
    c.admin.exports.complaintsCsv({ from: "2026-01-01", to: "2026-01-31" }),
  AdminExportsController_settlementsCsv: (c) =>
    c.admin.exports.settlementsCsv({ from: "2026-01-01", to: "2026-01-31" }),
  AdminExportsController_merchantsCsv: (c) =>
    c.admin.exports.merchantsCsv({ from: "2026-01-01", to: "2026-01-31" }),
};

function stubResponse(): Response {
  return new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("query passthrough coverage (regression for methods that silently drop query params)", () => {
  const operations = queryBearingOperations();

  it("has a COVERAGE entry for every query-bearing operation the current contract declares", () => {
    const missing = operations
      .filter((op) => !COVERAGE[op.operationId])
      .map((op) => op.operationId);
    expect(missing).toEqual([]);
  });

  it.each(
    operations.map((op): [string, QueryBearingOperation] => [
      op.operationId,
      op,
    ]),
  )(
    "%s forwards every declared query param onto the request URL",
    async (_operationId, op) => {
      const call = COVERAGE[op.operationId];
      expect(call).toBeDefined(); // redundant with the coverage test above, but keeps this test meaningful standalone

      let capturedUrl = "";
      const fetchMock = jest.fn(async (url: string) => {
        capturedUrl = url;
        return stubResponse();
      });
      const client = createClient({
        baseUrl: "http://api.test",
        transport: "body",
        actor: "CONSUMER",
        getAccessToken: () => "token",
        fetch: fetchMock as unknown as typeof fetch,
      });

      await call(client);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedUrl.startsWith(`http://api.test${op.path}?`)).toBe(true);
      for (const paramName of op.queryParamNames) {
        expect(capturedUrl).toEqual(expect.stringContaining(`${paramName}=`));
      }
    },
  );
});
