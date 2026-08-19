/**
 * Screenshots the Phase 1 review screen (/vitrin) end to end.
 *
 *   cd apps/consumer && npx expo export -p web && npx serve dist -l 8081
 *   cd e2e && node scripts/vitrin-shot.mjs /tmp/vitrin
 *
 * Run from the e2e workspace so @playwright/test resolves.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const CIKTI = process.argv[2] ?? "/tmp/shots";
const URL = process.env.VITRIN_URL ?? "http://localhost:8081/vitrin";
fs.mkdirSync(CIKTI, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const hatalar = [];
page.on("console", (msg) => { if (msg.type() === "error") hatalar.push(msg.text()); });
page.on("pageerror", (err) => hatalar.push(String(err)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// react-native-web scrolls INSIDE a div, so the window never moves.
const kaydiriciSec = () =>
  page.evaluateHandle(() => {
    const hepsi = [...document.querySelectorAll("div")];
    return hepsi.reduce((en, d) => (d.scrollHeight > (en?.scrollHeight ?? 0) && d.scrollHeight > d.clientHeight + 200 ? d : en), null);
  });

const kaydirici = await kaydiriciSec();
const toplam = await kaydirici.evaluate((el) => (el ? el.scrollHeight : 0));

const adim = 1000;
let i = 0;
for (let y = 0; y < toplam; y += adim) {
  await kaydirici.evaluate((el, v) => { if (el) el.scrollTop = v; }, y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${CIKTI}/${String(i).padStart(2, "0")}-y${y}.png` });
  i += 1;
}

const telefon = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await telefon.goto(URL, { waitUntil: "networkidle" });
await telefon.waitForTimeout(2000);
await telefon.screenshot({ path: `${CIKTI}/telefon-ust.png` });

console.log(JSON.stringify({ toplam, kareler: i, hatalar }, null, 2));
await browser.close();
