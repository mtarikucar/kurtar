/**
 * One walk through the WHOLE consumer app, in both palettes, against the
 * real backend — the merge-review surface.
 *
 * The per-track scripts each cover their own screens, so nothing had ever
 * photographed the app as one artifact: a person opening it after sunset
 * sees discovery, a card, a purchase, an order and a profile in a single
 * session, and the question this script exists to answer is whether those
 * screens look like one app.
 *
 *   node scripts/tam-gezinti.mjs /tmp/gezinti [gece|alacakaranlik|gunduz]
 *
 * Login is real (the OTP is read off the backend's dev log), so every
 * screen shows real seeded data rather than a mock. The clock is faked
 * AFTER the session exists: the server validates the OTP against its own
 * real clock, and only the client's idea of "now" — which is what picks
 * the palette and drives the countdown — is moved.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import pg from "pg";

const CIKTI = process.argv[2] ?? "/tmp/gezinti";
const FAZ = process.argv[3] ?? "gece";
const URL = process.env.GEZINTI_URL ?? "http://localhost:8092";
const BACKEND_LOG = process.env.BACKEND_LOG ?? "/tmp/kurtar-backend-e2e.log";
const API = process.env.GEZINTI_API ?? "http://localhost:4750";
const DB = process.env.DATABASE_URL ?? "postgresql://kurtar:kurtar@localhost:4754/kurtar";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "change-me-dev-webhook-secret";
const PHONE = "5551110004";
fs.mkdirSync(CIKTI, { recursive: true });

// Every instant is on the seeded offers' own calendar day, inside the
// seeded 19:00-21:00 pickup window for gece and alacakaranlik, before it
// for gunduz. Sunset in Istanbul that day is 20:00, so alacakaranlik
// (sunset-45min .. sunset+25min) is 19:15-20:25 and 19:45 sits squarely
// inside it AND inside the pickup window — which is the whole point of
// the phase: it is the hour the shutters come down while the shops are
// still open.
const ZAMAN = {
  gece: new Date("2026-08-19T17:35:00.000Z"), // 20:35 Istanbul
  alacakaranlik: new Date("2026-08-19T16:45:00.000Z"), // 19:45 Istanbul
  gunduz: new Date("2026-08-19T09:30:00.000Z"), // 12:30 Istanbul
}[FAZ];
if (!ZAMAN) throw new Error(`unknown phase: ${FAZ}`);

const logBoyutu = () => {
  try {
    return fs.statSync(BACKEND_LOG).size;
  } catch {
    return 0;
  }
};

function sonOtp(suffix, oncekiBoyut) {
  const fd = fs.openSync(BACKEND_LOG, "r");
  const boyut = fs.fstatSync(fd).size;
  const uzunluk = Math.max(0, boyut - oncekiBoyut);
  const arabellek = Buffer.alloc(uzunluk);
  fs.readSync(fd, arabellek, 0, uzunluk, oncekiBoyut);
  fs.closeSync(fd);
  const satirlar = arabellek
    .toString("utf8")
    .split("\n")
    .filter((l) => l.includes(`OTP for +90****${suffix}`));
  const eslesme = satirlar.at(-1)?.match(/: (\d{6}) \(dev only\)/);
  if (!eslesme) throw new Error("OTP not found in the log written since our own request");
  return eslesme[1];
}

const browser = await chromium.launch({
  args: ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const hatalar = [];
page.on("console", (m) => m.type() === "error" && hatalar.push(m.text()));
page.on("pageerror", (e) => hatalar.push(String(e)));

let i = 0;
async function cek(ad) {
  i += 1;
  const dosya = `${String(i).padStart(2, "0")}-${ad}-${FAZ}.png`;
  await page.screenshot({ path: `${CIKTI}/${dosya}` });
  console.log("shot:", dosya);
}

// ---- Login FIRST, on an untouched clock. The OTP exchange is the one
// step that has to agree with the server's real clock (expiry, resend
// cooldown), and a frozen client clock silently breaks it — the
// signed-out screens are photographed at the end, on their own page. ----
await page.goto(`${URL}/phone`, { waitUntil: "networkidle" });
await page.getByPlaceholder("5xx xxx xx xx").fill(PHONE);
let girdi = false;
let offset = 0;
for (let d = 0; d < 4 && !girdi; d += 1) {
  offset = logBoyutu();
  await page.getByTestId("phone-submit").click();
  try {
    await page.waitForURL(/otp/, { timeout: 6000 });
    girdi = true;
  } catch {
    console.log(`phone submit ${d + 1} did not navigate; url=${page.url()}`);
    await page.waitForTimeout(15000);
  }
}
if (!girdi) throw new Error("could not reach /otp");
await page.waitForTimeout(800);
await page.getByTestId("otp-input").fill(sonOtp("04", offset));
await page.getByTestId("otp-verify").click();
await page.waitForURL(/permissions|\(tabs\)|\/$/, { timeout: 12000 });
await page.waitForTimeout(800);
if (/permissions/.test(page.url())) {
  await page.waitForTimeout(400);
  await cek("izinler");
  await page.getByText("Devam et", { exact: true }).click();
  await page.waitForTimeout(1500);
}

// From here on every move is an IN-APP navigation, never a page load.
// `expo-secure-store` has no web implementation (its web build is an
// empty object), so the refresh token lives only in memory for the tab's
// lifetime — a `page.goto()` drops the session and every screen after it
// photographs the signed-out phone screen instead. Clicking is also how a
// person actually moves through the app.
// The palette is pinned by the BUILD (EXPO_PUBLIC_FAZ_ZORLA), not by
// faking the browser clock: freezing Date.now() leaves the clock
// provider's real timers running against a standing-still clock and the
// app renders an empty ground. Build one dist per phase, review each.
await page.waitForTimeout(800);

// The tab bar renders as links; "Harita" is ALSO a heading on the
// discovery screen's map placeholder, so a bare text match picks the
// wrong node.
async function sekmeye(ad) {
  const sekme = page.getByRole("link", { name: ad, exact: true }).last();
  if (await sekme.count()) await sekme.click();
  else await page.getByText(ad, { exact: true }).last().click();
  await page.waitForTimeout(1800);
}

await sekmeye("Keşfet");
await cek("kesif-liste");

await page.evaluate(() => {
  const el = document.querySelector('[data-testid="kesif-liste"]');
  if (el) {
    el.scrollTop = 420;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  }
});
await page.waitForTimeout(600);
await cek("kesif-kaydirilmis");

await sekmeye("Harita");
await page.waitForTimeout(1200);
await cek("harita");

await sekmeye("Ara");
await cek("arama");

await sekmeye("Favoriler");
await cek("favoriler");

await sekmeye("Siparişler");
await cek("siparisler");

await sekmeye("Profil");
await cek("profil-etki");

await page.evaluate(() => window.scrollBy(0, 700));
await page.waitForTimeout(600);
await cek("profil-sokak");

// Back to discovery and open the first storefront the list offers —
// tapping a real card is the only way into the offer/purchase path with
// the session intact.
await sekmeye("Keşfet");
// Whichever storefront the street offers first — naming one couples the
// walk to seed data that the walk itself spends (it buys a bag).
await page.locator('[data-testid="kesif-liste"] [role="button"]').first().click();
await page.waitForTimeout(1800);
await cek("teklif-detay");

// ---- The money loop, all the way to an open shutter. Everything past
// this point paints `bg.derin` rather than the street, so it is the only
// part of the walk that photographs the recess: buy -> pay -> the
// confirmation's lit interior -> the redeem screen, closed and open.
//
// GEZINTI_SATIN_ALMA=0 stops here. The leg SPENDS seeded stock and adds
// an order, so two runs of the full walk never see the same data — which
// makes it useless for the one thing a before/after comparison needs,
// namely two frames that differ only by the change under review. ----
if (process.env.GEZINTI_SATIN_ALMA === "0") {
  console.log(JSON.stringify({ faz: FAZ, hatalar, satinAlma: "atlandı" }, null, 2));
  await browser.close();
  process.exit(0);
}

await page.getByTestId("offer-buy-cta").click();
await page.waitForTimeout(1500);
await cek("satin-alma");

await page.getByTestId("purchase-consent-checkbox").click();
await page.waitForTimeout(300);
await page.getByTestId("purchase-confirm").click();
await page.waitForTimeout(2500);
await cek("odeme");

// The mock provider does NOT confirm on its own — kurtar's payment flow
// is webhook-driven on purpose (see MockPaymentProvider's own note), and
// `react-native-webview` has no web build at all, so the provider page
// the screen embeds is a red "does not support this platform" line. The
// review therefore delivers the webhook the provider would have: the
// screen's own poll is what picks it up, so everything downstream of it
// is the real flow rather than a staged screen.
const havuz = new pg.Pool({ connectionString: DB });
try {
  const { rows } = await havuz.query(
    `select p."merchantOid", p."amountCents"
       from payments p
       join reservations r on r.id = p."reservationId"
      where r.status = 'PENDING_PAYMENT'
      order by p."createdAt" desc
      limit 1`,
  );
  if (!rows[0]) throw new Error("no PENDING_PAYMENT reservation to settle");
  const cevap = await fetch(`${API}/api/webhooks/payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
    body: JSON.stringify({
      merchantOid: rows[0].merchantOid,
      status: "success",
      totalCents: rows[0].amountCents,
      eventId: `gezinti-${Date.now()}`,
    }),
  });
  console.log("webhook:", cevap.status, rows[0].merchantOid);
} finally {
  await havuz.end();
}

await page
  .getByTestId("satin-alma-onayi")
  .waitFor({ timeout: 30000 })
  .catch(() => console.log("confirmation did not arrive"));
await page.waitForTimeout(3200); // let the shutter finish rolling up
await cek("onay");

await page.getByTestId("onay-kepengi-ac").click();
await page.waitForTimeout(2000);
await cek("kepenk-kapali");

// The shutter is raised by dragging its handle ≥140pt up. Two short
// drags reveal the app's own text fallback, which is the documented way
// out for anyone the gesture fails — including this script.
const kol = page.getByTestId("kepenk-kol-suruklenir");
if (await kol.count()) {
  const kutu = await kol.boundingBox();
  if (kutu) {
    const x = kutu.x + kutu.width / 2;
    const y = kutu.y + kutu.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let adim = 1; adim <= 12; adim += 1) {
      await page.mouse.move(x, y - (200 * adim) / 12, { steps: 2 });
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1600);
  }
}
if (!(await page.getByTestId("kepenk-acik").count())) {
  for (let deneme = 0; deneme < 2; deneme += 1) {
    const kutu = await kol.boundingBox();
    if (!kutu) break;
    await page.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2);
    await page.mouse.down();
    await page.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2 - 20, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  const yardim = page.getByTestId("kepenk-yardim");
  if (await yardim.count()) {
    await yardim.click();
    await page.waitForTimeout(1600);
  }
}
await cek("kepenk-acik");

// ---- Signed-out surfaces, on their own page so the login above never
// had to run against a frozen clock. ----
const cikis = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
await cikis.goto(`${URL}/phone`, { waitUntil: "networkidle" });
await cikis.waitForTimeout(700);
i += 1;
await cikis.screenshot({ path: `${CIKTI}/${String(i).padStart(2, "0")}-telefon-${FAZ}.png` });
console.log("shot: telefon");
await cikis.close();

console.log(JSON.stringify({ faz: FAZ, hatalar }, null, 2));
await browser.close();
