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
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const CIKTI = process.argv[2] ?? "/tmp/kesif-shots";
const URL = process.env.KESIF_URL ?? "http://localhost:8090";
fs.mkdirSync(CIKTI, { recursive: true });

// `serve`'s own port (8090) isn't in the backend's fixed dev CORS
// allowlist (only 5173/5174/3000/8081 — see backend/src/main.ts, and
// 8081 is already in use by another concurrent review session this run
// must not disturb). `--disable-web-security` scopes the bypass to this
// throwaway Chromium profile only — it never touches the backend or any
// other agent's session.
const browser = await chromium.launch({
  args: ["--disable-web-security", "--disable-site-isolation-trials"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const hatalar = [];
page.on("console", (msg) => {
  if (msg.type() === "error") hatalar.push(msg.text());
});
page.on("pageerror", (err) => hatalar.push(String(err)));

// --- Keşfet (discover) — catch the closed-street loading frame BEFORE
// the (fast, local) backend responds, by throttling the discovery
// request just for this one load. ---
await page.route("**/api/discovery/offers**", async (route) => {
  await new Promise((r) => setTimeout(r, 1500));
  await route.continue().catch(() => undefined);
});
await page.goto(URL + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await page.screenshot({ path: `${CIKTI}/01-kesif-yukleniyor.png` });
await page.mouse.move(195, 600);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(200);
await page.screenshot({ path: `${CIKTI}/01b-kesif-yukleniyor-alt.png` });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${CIKTI}/02-kesif-liste.png` });
await page.unroute("**/api/discovery/offers**").catch(() => undefined);

// --- Keşfet, scrolled (collapsing map header) ---
// A direct scrollTop set (rather than a simulated wheel gesture) — the
// FlatList's DOM scroll container is what `onScroll` is bound to, and a
// physical wheel/touch gesture at a page coordinate is not reliably
// routed to it under headless Chromium.
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="kesif-liste"]');
  if (el) {
    el.scrollTop = 300;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  }
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${CIKTI}/03-kesif-kaydirilmis.png` });

// --- Keşfet, KAFE filter (no seeded OTHER-category offers -> filtered-empty street) ---
await page.getByTestId("kesif-cip-KAFE").click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${CIKTI}/05-kesif-bos-filtreli.png` });

// --- Keşfet, forced network error -> the error street ---
await page.route("**/api/discovery/offers**", (route) => route.abort());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${CIKTI}/06-kesif-hata.png` });
await page.unroute("**/api/discovery/offers**").catch(() => undefined);

// --- Harita (map) tab ---
await page.goto(URL + "/harita", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${CIKTI}/04-harita.png` });

console.log(JSON.stringify({ hatalar }, null, 2));
await browser.close();
