/**
 * Screenshots the Track A screens (Keşfet + Harita) at 390pt, end to end
 * against the exported web build + the real local backend.
 *
 * `expo-secure-store` ships an empty `{}` native module on web (its own
 * source, not a bundler quirk), so `getStoredRefreshToken()` throws on
 * every cold web load and no session — cookie, localStorage, anything —
 * can ever survive one. That is a pre-existing, cross-track auth-context
 * issue, unrelated to and out of scope for this track; see the design
 * build log for the full diagnosis. Reviewing an authenticated route on
 * web therefore needs a THROWAWAY, LOCAL-ONLY bypass, taken back out
 * before committing:
 *
 *   1. In src/app/index.tsx, temporarily OR in an env-gated bypass to the
 *      `status === "signedIn"` check before `<Redirect href="/(tabs)" />`.
 *   2. Same in src/app/(tabs)/_layout.tsx's `status === "signedOut"` gate
 *      (AND it, negated).
 *   3. cd apps/consumer && EXPO_PUBLIC_API_BASE_URL=http://localhost:4750 \
 *        EXPO_PUBLIC_KESIF_SCREENSHOT_BYPASS=1 npx expo export -p web
 *   4. npx serve dist -l 8090
 *   5. cd e2e && node scripts/kesif-shot.mjs /tmp/kesif-shots
 *   6. `git checkout` the two files from step 1/2 — NEVER commit the bypass.
 *
 * Run from the e2e workspace so @playwright/test resolves.
 *
 * DAY vs NIGHT (both required — see the design review notes): every frame
 * this script used to take was at whatever the wall clock happened to be
 * when someone ran it, which in practice meant the app's gündüz palette
 * got reviewed over and over and gece never did — this app's one hour of
 * relevance is after sunset. Playwright's clock is faked to two FIXED
 * instants on the seeded offers' own calendar day, not "now", so the two
 * palettes are always comparable and the run is reproducible regardless
 * of when it's launched:
 *   - GUNDUZ_ZAMAN — midday, safely `gündüz`, before the seeded pickup
 *     window opens (mirrors the ORIGINAL 11:30 frames' "not open yet").
 *   - GECE_ZAMAN — after sunset + the 25-minute `gece` threshold, and
 *     still inside the seeded pickup window (~25 minutes left) — the
 *     shutter/light gauge at its most urgent, in the one palette nobody
 *     had looked at.
 * Faking the BROWSER's clock only changes what the client thinks "now"
 * is; the offers' `pickupStartAt`/`pickupEndAt` are real fixed instants
 * from the seeded backend, so the gauge/urgency math is genuine, not
 * simulated.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const CIKTI = process.argv[2] ?? "/tmp/kesif-shots";
const URL = process.env.KESIF_URL ?? "http://localhost:8090";
fs.mkdirSync(CIKTI, { recursive: true });

const GUNDUZ_ZAMAN = new Date("2026-08-19T09:30:00.000Z"); // 12:30 Istanbul
const GECE_ZAMAN = new Date("2026-08-19T17:35:00.000Z"); // 20:35 Istanbul

const browser = await chromium.launch({
  // `serve`'s own port isn't in the backend's fixed dev CORS allowlist
  // (only 5173/5174/3000/8081) — `--disable-web-security` scopes the
  // bypass to this throwaway Chromium profile only, never the backend or
  // any other agent's session.
  args: ["--disable-web-security", "--disable-site-isolation-trials"],
});

async function yeniSayfa(zaman) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const hatalar = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") hatalar.push(msg.text());
  });
  page.on("pageerror", (err) => hatalar.push(String(err)));
  // `setFixedTime` fakes `Date.now()`/`new Date()` only — every other
  // timer keeps running in real time, so React, fetch and the app's own
  // 60s clock bucket all behave normally around the faked instant.
  await page.clock.setFixedTime(zaman);
  return { page, hatalar };
}

async function kesifCekimleri({ page, hatalar }, ekEk) {
  // --- Keşfet (discover) — catch the closed-street loading frame BEFORE
  // the (fast, local) backend responds, by throttling the discovery
  // request just for this one load. ---
  await page.route("**/api/discovery/offers**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => undefined);
  });
  await page.goto(URL + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${CIKTI}/01-kesif-yukleniyor${ekEk}.png` });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${CIKTI}/02-kesif-liste${ekEk}.png` });
  await page.unroute("**/api/discovery/offers**").catch(() => undefined);

  // --- Keşfet, unfiltered but network-mocked to zero results — the REAL
  // day/night empty copy (spec §4.8), not the filtered-empty variant,
  // deterministic regardless of what the seeded backend currently has. ---
  await page.route("**/api/discovery/offers**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }),
    }),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${CIKTI}/05-kesif-bos${ekEk}.png` });
  await page.unroute("**/api/discovery/offers**").catch(() => undefined);

  console.log(JSON.stringify({ pass: ekEk || "-gunduz(day-default)", hatalar }, null, 2));
}

// --- Day pass (gündüz, fixed midday) ---
const gunduz = await yeniSayfa(GUNDUZ_ZAMAN);
await kesifCekimleri(gunduz, "-gunduz");

// --- Keşfet, scrolled (collapsing map header) — day only; not part of
// the reviewed defects, kept for the map-header regression it already
// covered. ---
await gunduz.page.goto(URL + "/", { waitUntil: "domcontentloaded" });
await gunduz.page.waitForTimeout(1200);
await gunduz.page.evaluate(() => {
  const el = document.querySelector('[data-testid="kesif-liste"]');
  if (el) {
    el.scrollTop = 300;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  }
});
await gunduz.page.waitForTimeout(500);
await gunduz.page.screenshot({ path: `${CIKTI}/03-kesif-kaydirilmis-gunduz.png` });

// --- Keşfet, KAFE filter (no seeded OTHER-category offers -> filtered-empty street) ---
await gunduz.page.getByTestId("kesif-cip-KAFE").click();
await gunduz.page.waitForTimeout(700);
await gunduz.page.screenshot({ path: `${CIKTI}/05b-kesif-bos-filtreli-gunduz.png` });

// --- Keşfet, forced network error -> the error street. An aborted
// request is a network error, and the query client retries those twice
// with backoff before surfacing `isError` (see query-client.ts) — a short
// wait here catches the retry spinner, not the paper-note error card. ---
await gunduz.page.route("**/api/discovery/offers**", (route) => route.abort());
await gunduz.page.reload({ waitUntil: "domcontentloaded" });
await gunduz.page.waitForTimeout(6000);
await gunduz.page.screenshot({ path: `${CIKTI}/06-kesif-hata-gunduz.png` });
await gunduz.page.unroute("**/api/discovery/offers**").catch(() => undefined);

// --- Harita (map) tab — day ---
await gunduz.page.goto(URL + "/harita", { waitUntil: "networkidle" });
await gunduz.page.waitForTimeout(1500);
await gunduz.page.screenshot({ path: `${CIKTI}/04-harita-gunduz.png` });
await gunduz.page.close();

// --- Night pass (gece, fixed post-sunset instant, offers still open) ---
const gece = await yeniSayfa(GECE_ZAMAN);
await kesifCekimleri(gece, "-gece");

await gece.page.goto(URL + "/harita", { waitUntil: "networkidle" });
await gece.page.waitForTimeout(1500);
await gece.page.screenshot({ path: `${CIKTI}/04-harita-gece.png` });
await gece.page.close();

await browser.close();
