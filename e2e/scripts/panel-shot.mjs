/**
 * Screenshots Track C's rebuilt screens (orders, order ticket, profile /
 * SENİN SOKAĞIN, notification prefs, complaints, complaint/report forms,
 * legal reader) logged in as the seeded demo consumer with a redeemed
 * order and a mid-thread complaint (Zeynep Şahin, +905551110004).
 *
 *   cd apps/consumer && npx expo export -p web && npx serve dist -l 8095
 *   cd e2e && node scripts/panel-shot.mjs /tmp/panel-shots
 *
 * Run from the e2e workspace so @playwright/test resolves. Reads the OTP
 * code off the backend's dev-mode debug log line — never part of any HTTP
 * response (see backend/src/modules/otp/otp.service.ts's class comment).
 *
 * PRE-EXISTING WEB-ONLY BUG this script routes around, not fixed here
 * (out of Track C's scope — apps/consumer/src/lib/secure-tokens.ts is
 * shared auth infra): `expo-secure-store`'s web module in this dependency
 * tree is a literal `export default {}` — every SecureStore call throws
 * on web, which auth-context.tsx's `verifyOtp()` does not catch, so the
 * FIRST login in a session still works (the access token is used
 * in-memory) but the misleading "Kod hatalı ya da süresi doldu" error
 * appears anyway, and — the part that matters for this script — no
 * refresh token ever actually reaches storage, so a page reload after
 * login cannot silently re-authenticate the way it can on iOS/Android.
 * This script's per-screen `page.goto()` calls therefore each land back
 * on /phone unless something makes web persistence real for the run —
 * e.g. temporarily branching secure-tokens.ts's three functions on
 * `Platform.OS === "web"` to an AsyncStorage-backed store instead, then
 * reverting before committing anything. See docs/design/build-log-
 * profil.md for the full writeup and the exact patch used.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const CIKTI = process.argv[2] ?? "/tmp/panel-shots";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const BACKEND_LOG = process.env.BACKEND_LOG ?? "/tmp/kurtar-backend-e2e.log";
const PHONE = "5551110004";
fs.mkdirSync(CIKTI, { recursive: true });

function logBoyutu() {
  try {
    return fs.statSync(BACKEND_LOG).size;
  } catch {
    return 0;
  }
}

/**
 * Reads the OTP off ONLY the log bytes appended after `oncekiBoyut` — the
 * masked line ("+90****04") is a two-digit suffix match, which is
 * genuinely ambiguous against any other phone number ending the same way
 * (a real risk with other tracks' own agents exercising this same shared
 * backend concurrently). Scoping to bytes written since our own request
 * narrows the race to a fraction of a second instead of the log's whole
 * history.
 */
function sonOtp(suffix, oncekiBoyut) {
  const fd = fs.openSync(BACKEND_LOG, "r");
  const boyut = fs.fstatSync(fd).size;
  const uzunluk = Math.max(0, boyut - oncekiBoyut);
  const arabellek = Buffer.alloc(uzunluk);
  fs.readSync(fd, arabellek, 0, uzunluk, oncekiBoyut);
  fs.closeSync(fd);
  const yeniIcerik = arabellek.toString("utf8");
  const satirlar = yeniIcerik.split("\n").filter((l) => l.includes(`OTP for +90****${suffix}`));
  const son = satirlar.at(-1);
  const eslesme = son?.match(/: (\d{6}) \(dev only\)/);
  if (!eslesme) throw new Error(`OTP not found in the log written since our own request (suffix ${suffix})`);
  return eslesme[1];
}

// CORS: the backend only allows the four fixed dev-server origins (see
// backend/src/main.ts's DEV_DEFAULT_CORS_ORIGINS), none of which is this
// review port — --disable-web-security sidesteps that for the automated
// screenshot session without touching the shared backend's CORS config
// or squatting on a port another track's own preview server might be
// using right now.
const browser = await chromium.launch({
  args: ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const hatalar = [];
page.on("console", (msg) => {
  if (msg.type() === "error") hatalar.push(msg.text());
});
page.on("pageerror", (err) => hatalar.push(String(err)));

let i = 0;
async function sekme(ad) {
  i += 1;
  const dosya = `${String(i).padStart(2, "0")}-${ad}.png`;
  await page.screenshot({ path: `${CIKTI}/${dosya}` });
  console.log(`shot: ${dosya}`);
}

// ---- Login ----
// The demo phone's 60s resend cooldown can already be armed (another
// script run, or another track exercising the same seeded consumer) —
// retry the submit a few times rather than failing outright.
await page.goto(`${URL}/phone`, { waitUntil: "networkidle" });
await page.getByPlaceholder("5xx xxx xx xx").fill(PHONE);
let girisOldu = false;
let logOffseti = 0;
for (let deneme = 0; deneme < 4 && !girisOldu; deneme += 1) {
  logOffseti = logBoyutu();
  await page.getByTestId("phone-submit").click();
  try {
    await page.waitForURL(/otp/, { timeout: 6000 });
    girisOldu = true;
  } catch {
    console.log(`phone submit attempt ${deneme + 1} did not navigate; url=${page.url()}`);
    await page.screenshot({ path: `${CIKTI}/debug-phone-attempt-${deneme + 1}.png` });
    await page.waitForTimeout(15000);
  }
}
if (!girisOldu) throw new Error("could not reach /otp after retries");
await page.waitForTimeout(800);

const kod = sonOtp("04", logOffseti);
console.log(`otp: ${kod}`);
await page.getByTestId("otp-input").fill(kod);
await page.getByTestId("otp-verify").click();

try {
  await page.waitForURL(/permissions/, { timeout: 10000 });
} catch (e) {
  await page.screenshot({ path: `${CIKTI}/debug-after-verify.png` });
  console.log("verify did not navigate; url:", page.url());
  throw e;
}
await page.getByText("Devam et", { exact: true }).click();
await page.waitForTimeout(1500);

// From here on, every screen is reached by a direct page.goto() rather
// than in-app clicks: a cold load re-establishes the session from the
// persisted refresh token (auth-context.tsx's bootstrap effect), and
// that is far more robust for scripted screenshots than chaining
// clicks/goBack()s through expo-router's web history, which repeatedly
// left stale elements intercepting pointer events in earlier runs of
// this exact script.
async function git(yol) {
  // "load" rather than "networkidle" — a couple of screens keep a
  // background poll alive (e.g. React Query staleTime refetch), which
  // makes "networkidle" hang for the full 30s even once the screen is
  // fully rendered.
  await page.goto(`${URL}${yol}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
}

// ---- Orders ----
await git("/orders");
await sekme("orders");

// Tap the order row via the shop-name text it renders. The demo
// consumer's one seeded order is at Caferağa Kahve Evi — see
// backend/prisma/seed-demo.ts's CONSUMERS table (consumer 4).
try {
  await page
    .getByText("Caferağa Kahve Evi", { exact: true })
    .click({ timeout: 15000 });
  await page.waitForTimeout(800);
  await sekme("order-detail");
} catch (e) {
  console.log("order detail tap skipped:", String(e).split("\n")[0]);
}

// ---- Profile / SENİN SOKAĞIN ----
await git("/profile");
await sekme("profile-top");

// ---- Notification preferences ----
await git("/notification-preferences");
await sekme("notification-prefs");

// ---- Complaints list + detail ----
await git("/complaints");
await sekme("complaints-list");
try {
  // The demo consumer's one seeded complaint's category — see
  // backend/prisma/seed-demo.ts's complaint block for consumer 4.
  await page.getByText("Yemek kalitesi", { exact: true }).click({ timeout: 15000 });
  await page.waitForTimeout(600);
  await sekme("complaint-detail");
} catch (e) {
  console.log("complaint detail tap skipped:", String(e).split("\n")[0]);
}

// ---- New complaint ----
await git("/complaint/new");
await sekme("complaint-new");

// ---- Legal reader ----
// `serve` has no SPA rewrite for a dynamic nested route it never
// generated a matching static file for ("/legal/[doc]" exported as its
// own shell, not "/legal/mesafeli-satis-sozlesmesi") — a direct goto()
// 404s here even though the SAME URL resolves fine once the app's own
// router is already running client-side. Reach it in-app instead.
await git("/profile");
try {
  await page.getByText("Yasal metinler", { exact: true }).click({ timeout: 15000 });
  await page.waitForTimeout(600);
  await sekme("legal");
} catch (e) {
  console.log("legal tap skipped:", String(e).split("\n")[0]);
}

// ---- Report screen (direct URL — no auth-gated fetch on mount) ----
const reportPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await reportPage.goto(`${URL}/report/new?targetType=OFFER&targetId=offer-1`, {
  waitUntil: "networkidle",
});
await reportPage.waitForTimeout(600);
await reportPage.screenshot({ path: `${CIKTI}/${String(i + 1).padStart(2, "0")}-report-new.png` });
console.log(`shot: ${String(i + 1).padStart(2, "0")}-report-new.png`);

console.log(JSON.stringify({ hatalar }, null, 2));
await browser.close();
