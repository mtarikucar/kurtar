/**
 * The four surfaces `tam-gezinti.mjs` never reaches — the shop page, the
 * rating form, the cancel sheet and the OTP step — photographed in one
 * signed-in session.
 *
 *   node scripts/kalan-yuzeyler-shot.mjs /tmp/kalan gece
 *
 * Every move is an in-app click or a client-side history push, never a
 * `page.goto()`: `expo-secure-store` has no web build, so the refresh
 * token lives in memory for the tab's lifetime and a real navigation
 * photographs the signed-out phone screen instead.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const CIKTI = process.argv[2] ?? "/tmp/kalan";
const FAZ = process.argv[3] ?? "gece";
const URL = process.env.GEZINTI_URL ?? "http://localhost:8101";
const BACKEND_LOG = process.env.BACKEND_LOG ?? "/tmp/kurtar-backend-e2e.log";
const PHONE = "5551110004";
fs.mkdirSync(CIKTI, { recursive: true });

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
async function cek(ad, hedef = page) {
  i += 1;
  const dosya = `${String(i).padStart(2, "0")}-${ad}-${FAZ}.png`;
  await hedef.screenshot({ path: `${CIKTI}/${dosya}` });
  console.log("shot:", dosya);
}

// ---- The OTP step, photographed FIRST and on its own signed-out page,
// so the exchange runs against the server's own clock. ----
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
    await page.waitForTimeout(15000);
  }
}
if (!girdi) throw new Error("could not reach /otp");
await page.waitForTimeout(900);
await cek("otp-bos");

await page.getByTestId("otp-input").fill("000000");
await page.waitForTimeout(200);
await page.getByTestId("otp-verify").click();
await page.waitForTimeout(1400);
await cek("otp-hatali");

await page.getByTestId("otp-input").fill(sonOtp("04", offset));
await page.getByTestId("otp-verify").click();
await page.waitForURL(/permissions|\(tabs\)|\/$/, { timeout: 12000 });
await page.waitForTimeout(900);
if (/permissions/.test(page.url())) {
  await page.getByText("Devam et", { exact: true }).click();
  await page.waitForTimeout(1600);
}

async function sekmeye(ad) {
  const sekme = page.getByRole("link", { name: ad, exact: true }).last();
  if (await sekme.count()) await sekme.click();
  else await page.getByText(ad, { exact: true }).last().click();
  await page.waitForTimeout(1800);
}

// ---- Favourite a real shop from the offer detail, so Favoriler has a
// row and the shop page has something to be about. ----
await sekmeye("Keşfet");
await page.getByText("Sürpriz", { exact: false }).first().click();
await page.waitForTimeout(1600);
// Favouriting is a real mutation, so only toggle it ON — running the
// script twice against the same seed would otherwise un-favourite the
// shop and leave Favoriler empty for the second phase.
const favoriDugmesi = page.getByTestId("teklif-favori");
if ((await favoriDugmesi.getAttribute("aria-label")) === "Favorilere ekle") {
  await favoriDugmesi.click();
  await page.waitForTimeout(900);
}
await page.getByTestId("teklif-geri").click();
await page.waitForTimeout(1400);

await sekmeye("Favoriler");
await cek("favoriler-dolu");

// ---- Siparişler -> the past order -> its ticket -> rate. ----
await sekmeye("Siparişler");
// The KURTARILDI stamp sits inside the row's own Pressable, so a click on
// it opens the ticket without depending on which shop the seed picked.
await page.getByText("KURTARILDI", { exact: true }).first().click({ force: true });
await page.waitForTimeout(1600);
const siparisId = page.url().split("/").pop();
await cek("siparis-bileti");

await page.getByText("Değerlendir", { exact: true }).first().click({ force: true });
await page.waitForTimeout(1400);
await cek("degerlendir");

// Three stars, so the form is photographed with the sodium lit rather
// than as five empty outlines.
const yildizlar = page.getByLabel("3 yıldız ver");
if (await yildizlar.count()) {
  await yildizlar.first().click({ force: true });
  await page.waitForTimeout(500);
  await cek("degerlendir-yildizli");
}

// ---- The cancel sheet and then the shop page, both reached with a
// client-side history push rather than a goto: the refresh token is in
// memory only, so a real navigation signs the tab out. ----
async function icerdenGit(yol) {
  await page.evaluate((hedef) => {
    window.history.pushState({}, "", hedef);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, yol);
  await page.waitForTimeout(1800);
}

await icerdenGit(`/cancel/${siparisId}`);
await cek("iptal");

await icerdenGit("/(tabs)/favorites");
await page.getByText("Pastanesi", { exact: false }).first().click({ force: true });
await page.waitForTimeout(1800);
await cek("dukkan");

console.log(JSON.stringify({ faz: FAZ, siparisId, hatalar }, null, 2));
await browser.close();
