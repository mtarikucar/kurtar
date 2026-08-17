import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { Client as PgClient } from "pg";

/**
 * The money loop, end to end, against the REAL backend + a REAL Postgres/
 * PostGIS/Redis + the REAL merchant-web/admin-web (built, not mocked):
 * consumer discovery -> reserve -> mock payment webhook -> CONFIRMED ->
 * merchant sees it in the pickup list -> redeem -> rating -> nightly
 * settlement batch -> admin approves -> payout recorded.
 *
 * Every step either drives a real browser against a real built app
 * (merchant-web, admin-web) or calls the real HTTP API directly (consumer/
 * webhook/setup — the Expo consumer app has no browser surface to drive;
 * see docs/operations.md's E2E section and task-14-report.md for why the
 * consumer side is exercised via API here and via its own jest+RNTL suite
 * elsewhere). Nothing in this file is mocked or stubbed.
 *
 * PRECONDITIONS (see package.json's `test` script doc comment / docs/
 * operations.md): the backend, merchant-web, and admin-web must already
 * be running and reachable at E2E_API_BASE_URL / E2E_MERCHANT_WEB_URL /
 * E2E_ADMIN_WEB_URL, migrations must be applied, and `npm run seed:demo
 * -w backend` must have already run (this test logs in as the seeded
 * Moda Fırın merchant and the seeded admin — see backend/prisma/
 * seed-demo.ts). E2E_BACKEND_LOG_FILE must point at the backend
 * process's stdout (the mock SMS provider logs the OTP code there, in
 * the clear, by design — see otp.service.ts's doc comment for why it is
 * NEVER echoed in the HTTP response).
 */

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://localhost:4750";
const MERCHANT_WEB_BASE =
  process.env.E2E_MERCHANT_WEB_URL ?? "http://localhost:5173";
const ADMIN_WEB_BASE = process.env.E2E_ADMIN_WEB_URL ?? "http://localhost:5174";
const WEBHOOK_SECRET =
  process.env.E2E_WEBHOOK_SECRET ?? "change-me-dev-webhook-secret";
const BACKEND_LOG_FILE = process.env.E2E_BACKEND_LOG_FILE;
// Same default as the dev stack's own DATABASE_URL (.env.example /
// ops/docker-compose.yml) — used ONLY to clean up the real rows this
// specific test run creates (see the final "cleanup" step's doc comment
// for why that matters: this test runs against the demo-seeded Moda
// Fırın merchant, and backend/prisma/seed-demo.ts's own teardown is not
// prefix-scoped to rows THIS test creates through the real API, which
// mint ordinary cuid ids, not `kd-demo-*` ones).
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://kurtar:kurtar@localhost:4754/kurtar";

// Seeded by backend/prisma/seed-demo.ts — see README.md's "demo credentials".
const MERCHANT_EMAIL = "hakan@modafirin.demo.kurtar.app"; // Moda Fırın, Kadıköy
const ADMIN_EMAIL = "demo.admin@kurtar.app";
const DEMO_PASSWORD = "KurtarDemo123!";

const MODA_FIRIN_LAT = 40.9789;
const MODA_FIRIN_LNG = 29.028;

/** A fresh phone number every run — never collides with the seeded demo
 * consumers (+905551110001..0009) or a previous run's leftover row. */
function freshConsumerPhone(): string {
  const suffix = Date.now().toString().slice(-8);
  return `+9055${suffix}`;
}

/** Europe/Istanbul is fixed UTC+3 year-round — see backend/src/common/
 * utils/istanbul-date.util.ts, mirrored here so the fresh offer this test
 * creates lands on the correct Istanbul calendar day regardless of the
 * machine running Playwright's own timezone. */
function istanbulDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Polls E2E_BACKEND_LOG_FILE for the most recent OTP code logged AFTER
 * `sinceBytes` (the file's size right before the OTP request was fired) —
 * see otp.service.ts: `logger.log(`[MOCK SMS] To: ***, Message: kurtar
 * dogrulama kodunuz: ${code}`)`. There is no other way to learn the code
 * (never in the HTTP response, deliberately — see that file's doc
 * comment on the account-takeover risk of a dev-mode echo).
 */
async function readOtpFromBackendLog(
  logFile: string,
  sinceBytes: number,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  const pattern = /kurtar dogrulama kodunuz: (\d{6})/g;
  while (Date.now() < deadline) {
    if (fs.existsSync(logFile)) {
      const size = fs.statSync(logFile).size;
      if (size > sinceBytes) {
        const fd = fs.openSync(logFile, "r");
        const length = size - sinceBytes;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, sinceBytes);
        fs.closeSync(fd);
        const text = buffer.toString("utf8");
        let match: RegExpExecArray | null;
        let lastCode: string | null = null;
        while ((match = pattern.exec(text)) !== null) lastCode = match[1];
        if (lastCode) return lastCode;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for an OTP code in ${logFile} (bytes since ${sinceBytes}). ` +
      "Is E2E_BACKEND_LOG_FILE pointed at the backend process's real stdout?",
  );
}

async function apiPost<T>(
  request: APIRequestContext,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await request.post(`${API_BASE}${path}`, {
    data: body,
    headers,
  });
  if (!res.ok()) {
    throw new Error(`POST ${path} -> ${res.status()}: ${await res.text()}`);
  }
  return res.json();
}

async function apiGet<T>(
  request: APIRequestContext,
  path: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await request.get(`${API_BASE}${path}`, { headers });
  if (!res.ok()) {
    throw new Error(`GET ${path} -> ${res.status()}: ${await res.text()}`);
  }
  return res.json();
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Thin wrapper over test.step() that also prints a plain step log to
 * stdout — Playwright's own reporters only surface step names on
 * failure/in the HTML report, and the whole point of this suite is a
 * step-by-step trail a reader can see the money loop complete through
 * without opening a trace viewer. */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return test.step(name, async () => {
    process.stdout.write(`  → ${name}\n`);
    const result = await fn();
    process.stdout.write(`  ✓ ${name}\n`);
    return result;
  });
}

// ---------------------------------------------------------------------
// Cleanup fixture state — deliberately module-scoped, not local to the
// test body. The pg cleanup below used to be the LAST `step()` inside the
// test itself; Playwright aborts a test at its first failed assertion, so
// any failure in an earlier step skipped cleanup entirely and left real,
// non-`kd-demo-`-prefixed rows referencing the seeded merchant behind —
// exactly the FK breakage `seed-demo.ts`'s own teardown would then hit on
// its next run. Moving cleanup into `test.afterEach` (this file has
// exactly one test, so afterEach and afterAll are equivalent here; afterEach
// reads more honestly as "runs after every test that touched this state")
// wrapped in try/finally means it always runs — pass, fail, or thrown
// exception mid-flight — using whatever ids the test managed to set before
// it stopped. Every delete below is safe to run against an id that was
// never set (still ""): a `WHERE col = ''` matches zero rows, it does not
// error.
// ---------------------------------------------------------------------
let cleanupState = {
  merchantContext: undefined as BrowserContext | undefined,
  adminContext: undefined as BrowserContext | undefined,
  offerId: "",
  reservationId: "",
  batchId: "",
  bagTemplateId: "",
  consumerPhone: "",
};

test.afterEach(async () => {
  const { merchantContext, adminContext, ...ids } = cleanupState;
  try {
    const pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
    try {
      await pg.query(
        'DELETE FROM "settlement_lines" WHERE "reservationId" = $1',
        [ids.reservationId],
      );
      // The payout-dispatch step issues a commission invoice for the
      // batch — a real, non-`kd-demo-`-prefixed row referencing this
      // merchant directly (Restrict), independent of the batch/line
      // cleanup above (CommissionInvoice.batchId is SetNull-on-delete,
      // so it would NOT block deleting the batch, but it WOULD block
      // seed-demo.ts's own teardown from later deleting the merchant).
      await pg.query('DELETE FROM "commission_invoices" WHERE "batchId" = $1', [
        ids.batchId,
      ]);
      // Only drop the batch this run touched if nothing else claims it
      // any more (a same-day re-run of this test adds a SECOND line to
      // the SAME batch — settlement-batch-builder.service.ts groups by
      // merchant+day — so an earlier run's cleanup must never delete a
      // batch a later run is still using).
      await pg.query(
        `DELETE FROM "settlement_batches"
         WHERE "id" = $1
           AND NOT EXISTS (SELECT 1 FROM "settlement_lines" WHERE "batchId" = $1)`,
        [ids.batchId],
      );
      await pg.query('DELETE FROM "ratings" WHERE "reservationId" = $1', [
        ids.reservationId,
      ]);
      await pg.query(
        'DELETE FROM "impact_ledgers" WHERE "reservationId" = $1',
        [ids.reservationId],
      );
      await pg.query('DELETE FROM "payments" WHERE "reservationId" = $1', [
        ids.reservationId,
      ]);
      await pg.query('DELETE FROM "reservations" WHERE "id" = $1', [
        ids.reservationId,
      ]);
      await pg.query('DELETE FROM "daily_offers" WHERE "id" = $1', [
        ids.offerId,
      ]);
      await pg.query('DELETE FROM "bag_templates" WHERE "id" = $1', [
        ids.bagTemplateId,
      ]);
      // The fresh consumer User this run signed up via OTP — same
      // reasoning: a real, non-`kd-demo-`-prefixed row.
      await pg.query('DELETE FROM "users" WHERE "phoneE164" = $1', [
        ids.consumerPhone,
      ]);
    } finally {
      await pg.end();
    }
  } finally {
    await merchantContext?.close();
    await adminContext?.close();
    cleanupState = {
      merchantContext: undefined,
      adminContext: undefined,
      offerId: "",
      reservationId: "",
      batchId: "",
      bagTemplateId: "",
      consumerPhone: "",
    };
  }
});

test("the money loop: discovery to payout", async ({ browser, request }) => {
  // A hard failure, not `test.skip()` — this suite has exactly one test,
  // so a missing E2E_BACKEND_LOG_FILE has no legitimate "skip" outcome to
  // report. A skip prints "1 skipped" and exits 0, which reads as "ran
  // clean" to anyone glancing at the summary line or a CI badge instead of
  // "never actually ran" — a real local footgun (`npx playwright test`
  // straight from this directory, without following operations.md's setup,
  // silently reported success). Failing loudly here means the ONLY way to
  // see "1 passed" is for the money loop to have genuinely run.
  if (!BACKEND_LOG_FILE) {
    throw new Error(
      "E2E_BACKEND_LOG_FILE is required to read the OTP code the mock SMS provider logs — see this file's doc comment and docs/operations.md's End-to-end test section.",
    );
  }

  // Separate browser contexts (no shared cookie jar) for the merchant-web
  // and admin-web portions — a real merchant and a real admin are
  // different people who never share one browser session, so this is the
  // honest shape for the test regardless.
  //
  // It is no longer load-bearing for correctness, though. This suite
  // originally surfaced a real cross-surface defect — one unscoped
  // `refreshToken` cookie at path /api/auth served all three actors on
  // one shared backend origin, so a browser holding a merchant session
  // handed that same cookie to admin-web's own refresh call and admin-web
  // rendered an authenticated shell off it. That is fixed at the backend
  // cookie layer: each actor now has its own cookie name AND path, and
  // /api/auth/<actor>/refresh rejects a token whose principal type
  // doesn't match (backend/src/modules/auth/refresh-cookie-transport.
  // util.ts, plus auth-refresh-actor-binding.realdb.spec.ts, which proves
  // a real merchant token cannot mint an admin session).
  const merchantContext = await browser.newContext();
  const adminContext = await browser.newContext();
  cleanupState.merchantContext = merchantContext;
  cleanupState.adminContext = adminContext;
  const page = await merchantContext.newPage();
  const adminPage = await adminContext.newPage();

  let merchantToken = "";
  let adminToken = "";
  let consumerToken = "";
  let offerId = "";
  let reservationId = "";
  let reservationCode = "";
  let merchantOid = "";
  let totalCents = 0;
  let batchId = "";
  let bagTemplateId = "";
  let pickupStartAtMs = 0;
  // GET /discovery/offers is Redis-cached for 5 minutes, keyed in part on
  // the `q` search param (discovery-cache-key.util.ts) — a bare, param-
  // less query repeated across back-to-back local runs of this same test
  // would keep hitting the FIRST run's cached (by-then-stale) result and
  // never see a later run's fresh offer. A run-unique title, searched by
  // `q`, gives every run its own cache key instead — a real, distinct
  // search query, not a cache bypass.
  const runToken = Date.now().toString(36);
  const bagTitle = `E2E Sürpriz Paket ${runToken}`;

  await step(
    "setup: merchant (Moda Fırın) logs in and publishes a fresh, live-now offer",
    async () => {
      const login = await apiPost<{ accessToken: string }>(
        request,
        "/api/auth/merchant/login",
        { email: MERCHANT_EMAIL, password: DEMO_PASSWORD },
      );
      merchantToken = login.accessToken;

      const me = await apiGet<{ stores: Array<{ id: string; name: string }> }>(
        request,
        "/api/merchants/me",
        bearer(merchantToken),
      );
      const store = me.stores.find((s) => s.name === "Moda Fırın");
      expect(
        store,
        "seeded Moda Fırın store must exist — run npm run seed:demo",
      ).toBeTruthy();

      // A fresh bag template avoids the (bagTemplateId, offerDate) unique
      // constraint the seeded demo offer already occupies for today.
      const template = await apiPost<{ id: string }>(
        request,
        "/api/bag-templates",
        {
          storeId: store!.id,
          title: bagTitle,
          category: "BAKERY",
          allergenDisclaimer: "Gluten, süt ve yumurta içerebilir.",
          originalValueCentsMin: 15000,
          originalValueCentsMax: 22000,
          priceCents: 6900,
        },
        bearer(merchantToken),
      );
      bagTemplateId = template.id;
      cleanupState.bagTemplateId = bagTemplateId;

      const now = new Date();
      const offerDate = istanbulDateKey(now);
      // pickupStartAt must be strictly in the future at creation time
      // (offer-window.rules.ts) — 15s is comfortably past by the time this
      // test reaches the redeem step several real network round trips
      // later; the redeem step also waits out any remainder explicitly.
      pickupStartAtMs = now.getTime() + 15_000;
      const pickupStartAt = new Date(pickupStartAtMs).toISOString();
      const pickupEndAt = new Date(now.getTime() + 2 * 3_600_000).toISOString();

      const offer = await apiPost<{ id: string }>(
        request,
        "/api/offers",
        {
          bagTemplateId: template.id,
          offerDate,
          qtyTotal: 3,
          pickupStartAt,
          pickupEndAt,
        },
        bearer(merchantToken),
      );
      offerId = offer.id;
      cleanupState.offerId = offerId;

      await apiPost(
        request,
        `/api/offers/${offerId}/publish`,
        {},
        bearer(merchantToken),
      );
    },
  );

  await step(
    "consumer: discovers the live offer via the real API",
    async () => {
      const res = await request.get(`${API_BASE}/api/discovery/offers`, {
        params: {
          lat: String(MODA_FIRIN_LAT),
          lng: String(MODA_FIRIN_LNG),
          radiusM: "3000",
          q: bagTitle,
          page: "1",
          pageSize: "20",
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const found = body.items.find(
        (i: { offerId: string }) => i.offerId === offerId,
      );
      expect(
        found,
        "the just-published offer must be discoverable near Moda Fırın",
      ).toBeTruthy();
    },
  );

  const consumerPhone = freshConsumerPhone();
  cleanupState.consumerPhone = consumerPhone;

  await step(
    "consumer: phone-OTP sign-in (real SMS-mock log, not a mocked HTTP call)",
    async () => {
      const sinceBytes = fs.existsSync(BACKEND_LOG_FILE!)
        ? fs.statSync(BACKEND_LOG_FILE!).size
        : 0;
      await apiPost(request, "/api/auth/otp/request", { phone: consumerPhone });
      const code = await readOtpFromBackendLog(BACKEND_LOG_FILE!, sinceBytes);
      const verify = await apiPost<{ accessToken: string }>(
        request,
        "/api/auth/otp/verify",
        { phone: consumerPhone, code },
      );
      consumerToken = verify.accessToken;
    },
  );

  await step("consumer: reserves the bag (real money-path claim)", async () => {
    const reservation = await apiPost<{
      reservationId: string;
      code: string;
      totalCents: number;
      payment: { merchantOid: string };
    }>(
      request,
      "/api/reservations",
      { offerId, qty: 1 },
      bearer(consumerToken),
    );
    reservationId = reservation.reservationId;
    cleanupState.reservationId = reservationId;
    reservationCode = reservation.code;
    totalCents = reservation.totalCents;
    merchantOid = reservation.payment.merchantOid;
    expect(totalCents).toBe(6900);
  });

  await step("mock PSP webhook confirms the payment", async () => {
    await request.post(`${API_BASE}/api/webhooks/payment`, {
      headers: { "x-webhook-secret": WEBHOOK_SECRET },
      data: {
        merchantOid,
        status: "success",
        totalCents,
        eventId: randomUUID(),
      },
    });

    const mine = await apiGet<{
      items: Array<{ id: string; status: string }>;
    }>(
      request,
      "/api/reservations/mine?page=1&pageSize=20",
      bearer(consumerToken),
    );
    const mineReservation = mine.items.find((r) => r.id === reservationId);
    expect(mineReservation?.status).toBe("CONFIRMED");
  });

  await step(
    "merchant-web: the reservation appears in the real pickup list",
    async () => {
      await page.goto(`${MERCHANT_WEB_BASE}/giris`);
      await page.getByLabel("E-posta").fill(MERCHANT_EMAIL);
      await page.getByLabel("Şifre").fill(DEMO_PASSWORD);
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await page.waitForURL(`${MERCHANT_WEB_BASE}/bugun`);

      await expect(page.getByText(reservationCode)).toBeVisible({
        timeout: 20_000,
      });
    },
  );

  await step(
    "merchant-web: redeems the pickup (real click, real API call)",
    async () => {
      // pickupStartAt was `now + 15s` at creation; the steps above already
      // spend several real network round trips, so by the time execution
      // reaches here the window has often already opened. Poll the known
      // pickupStartAtMs instead of a flat 16s sleep (this used to be most
      // of the test's own runtime): wait only whatever's actually left,
      // in short slices, so a redeem attempted before the window opens
      // (correctly rejected as RESERVATION_NOT_REDEEMABLE — a real guard
      // this test wants to avoid tripping, not prove) never happens, but
      // nothing is wasted once the window is already open.
      while (Date.now() < pickupStartAtMs) {
        await page.waitForTimeout(Math.min(500, pickupStartAtMs - Date.now()));
      }

      const row = page.getByText(reservationCode).locator("..").locator("..");
      await row.getByRole("button", { name: "Teslim et" }).click();
      await expect(row.getByRole("button", { name: "Teslim et" })).toHaveCount(
        0,
        {
          timeout: 20_000,
        },
      );
    },
  );

  await step("consumer: rates the redeemed pickup", async () => {
    const rating = await apiPost<{ id: string }>(
      request,
      `/api/reservations/${reservationId}/rating`,
      { overallStars: 5, foodQuality: 5, service: 5 },
      bearer(consumerToken),
    );
    expect(rating.id).toBeTruthy();
  });

  interface SettlementLine {
    reservationId: string;
    grossCents: number;
    bagFeeCents: number;
    bagFeeVatCents: number;
    withholdingCents: number;
  }
  interface SettlementBatchDetail {
    id: string;
    merchant: { tradeName: string };
    settlementLines: SettlementLine[];
  }
  let ourLine: SettlementLine | undefined;

  await step("admin: runs the nightly settlement cycle on demand", async () => {
    const login = await apiPost<{ accessToken: string }>(
      request,
      "/api/auth/admin/login",
      { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
    );
    adminToken = login.accessToken;

    const result = await apiPost<{ batchIds: string[] }>(
      request,
      "/api/admin/settlements/run-nightly",
      {},
      bearer(adminToken),
    );
    expect(result.batchIds.length).toBeGreaterThan(0);

    // Find OUR line by reservationId, not by assuming Moda Fırın's batch
    // has exactly one line — a re-run against an already-exercised DB (a
    // prior local run, a shared dev DB) can leave other Moda Fırın lines
    // batched alongside this run's own, and asserting against the whole
    // batch's totals would be wrong (and brittle) either way.
    for (const id of result.batchIds) {
      const batch = await apiGet<SettlementBatchDetail>(
        request,
        `/api/admin/settlements/${id}`,
        bearer(adminToken),
      );
      if (batch.merchant.tradeName !== "Moda Fırın") continue;
      const line = batch.settlementLines.find(
        (l) => l.reservationId === reservationId,
      );
      if (line) {
        batchId = batch.id;
        cleanupState.batchId = batchId;
        ourLine = line;
        break;
      }
    }
    expect(
      ourLine,
      "the nightly cycle must have batched this test's own redeemed reservation",
    ).toBeTruthy();
    expect(ourLine!.grossCents).toBe(totalCents);
    // Fixed platform bag fee (seeded platform_pricing) × qty 1, KDV %20 on
    // it, %1 stopaj on (gross - bagFee - vat) — settlement-math.ts's exact
    // formula, re-derived here independently rather than trusting the
    // server's own arithmetic on faith.
    expect(ourLine!.bagFeeCents).toBe(2500);
    expect(ourLine!.bagFeeVatCents).toBe(500);
    expect(ourLine!.withholdingCents).toBe(
      Math.round(((totalCents - 2500 - 500) * 1) / 100),
    );
  });

  await step(
    "admin-web: approves the settlement batch (real click)",
    async () => {
      await adminPage.goto(`${ADMIN_WEB_BASE}/login`);
      await adminPage.getByLabel("E-posta").fill(ADMIN_EMAIL);
      await adminPage.getByLabel("Şifre").fill(DEMO_PASSWORD);
      await adminPage.getByRole("button", { name: "Giriş yap" }).click();
      // Login is an async mutation — wait for the auth-gated redirect away
      // from /login before doing anything else.
      await adminPage.waitForURL((url) => !url.pathname.includes("/login"));
      // The dashboard fires several parallel data queries on mount and
      // the sidebar nav can re-render while those settle — wait for its
      // own heading rather than racing a click against that initial
      // flurry (an intermittent "element detached, retrying" otherwise).
      await expect(
        adminPage.getByRole("heading", { name: "Panel" }),
      ).toBeVisible({ timeout: 15_000 });

      // The access token lives in memory only (never localStorage — see
      // docs/frontend-contract.md), so a hard page.goto() to a deep URL
      // would force a full reload and depend on the httpOnly refresh
      // cookie alone to restore the session. Click through the real nav +
      // list instead, exactly like an admin actually would — client-side
      // routing the whole way, session never dropped.
      await adminPage.getByRole("link", { name: "Finans" }).click();
      await adminPage.getByLabel("Durum").selectOption({ label: "Hesaplandı" });
      const row = adminPage.locator(`a[href$="/settlements/${batchId}"]`);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();

      await adminPage.getByRole("button", { name: "Onayla" }).click();
      const dialog = adminPage.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Onayla" }).click();
      await expect(
        adminPage.getByRole("button", { name: "Tekrar dene" }),
      ).toBeVisible({
        timeout: 15_000,
      });
    },
  );

  await step(
    "admin-web: retries payout dispatch — the batch is SENT with a real payout ref",
    async () => {
      await adminPage.getByRole("button", { name: "Tekrar dene" }).click();
      const dialog = adminPage.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Tekrar dene" }).click();
      // The retry button disappears once the batch leaves APPROVED (SENT
      // has nothing left to retry) — the real, final UI-observable signal.
      await expect(
        adminPage.getByRole("button", { name: "Tekrar dene" }),
      ).toHaveCount(0, { timeout: 15_000 });

      const finalBatch = await apiGet<
        SettlementBatchDetail & {
          status: string;
          pspTransferRef: string | null;
          netPayoutCents: number;
          membershipOffsetCents: number;
          refundClawbackCents: number;
          sentAt: string | null;
        }
      >(request, `/api/admin/settlements/${batchId}`, bearer(adminToken));

      expect(finalBatch.status).toBe("SENT");
      expect(finalBatch.pspTransferRef).toBeTruthy();
      expect(finalBatch.sentAt).toBeTruthy();
      // A real payout ref only proves SOMETHING was sent — re-check that our
      // specific line's own money (not just the batch aggregate, which can
      // legitimately include other lines) survived approval/payout unchanged.
      // Compared field-by-field, not via a whole-object match: the API
      // response carries extra fields (id/createdAt/updatedAt/redeemedAt)
      // this test never pinned down, and updatedAt legitimately changes
      // between the CALCULATED read and this SENT one.
      const finalLine = finalBatch.settlementLines.find(
        (l) => l.reservationId === reservationId,
      );
      expect(finalLine?.grossCents).toBe(ourLine!.grossCents);
      expect(finalLine?.bagFeeCents).toBe(ourLine!.bagFeeCents);
      expect(finalLine?.bagFeeVatCents).toBe(ourLine!.bagFeeVatCents);
      expect(finalLine?.withholdingCents).toBe(ourLine!.withholdingCents);
      // netPayoutCents pinned exactly, not just bounded below: sum every
      // line's own (gross - bagFee - vat - withholding) — settlement-
      // math.ts's `computeSettlement`, re-derived here independently — then
      // subtract this batch's own membership offset / refund clawback,
      // exactly like the server does. Summing every line rather than just
      // `ourLine` is deliberate: the demo-seeded Moda Fırın merchant has no
      // other REDEEMED reservation for today, so this batch should hold
      // exactly one line in the common case, but deriving from whatever
      // lines are actually present is correct even against an
      // already-exercised DB (a prior local run) where it might not be.
      const linesNetCents = finalBatch.settlementLines.reduce(
        (sum, l) =>
          sum +
          l.grossCents -
          l.bagFeeCents -
          l.bagFeeVatCents -
          l.withholdingCents,
        0,
      );
      expect(finalBatch.netPayoutCents).toBe(
        linesNetCents -
          finalBatch.membershipOffsetCents -
          finalBatch.refundClawbackCents,
      );
    },
  );

  // Cleanup (removing this run's own rows, and closing both browser
  // contexts) happens in `test.afterEach` above, not here — see that
  // block's doc comment for why: it must run even if an assertion above
  // throws, not only on this line being reached.
});
