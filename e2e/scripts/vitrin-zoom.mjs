/**
 * A 4× close-up of one card on the review screen, for looking at the
 * corrugation, the lip, the light, the packages and the plaque bolts.
 *
 *   cd e2e && node scripts/vitrin-zoom.mjs /tmp/vitrin "MODA FIRIN" 2
 */
import { chromium } from "@playwright/test";
const CIKTI = process.argv[2] ?? "/tmp/shots";
const AD = process.argv[3] ?? "MODA FIRIN";
const SIRA = Number(process.argv[4] ?? 0);
const URL = process.env.VITRIN_URL ?? "http://localhost:8081/vitrin";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 4 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const hedef = page.getByText(AD).nth(SIRA);
await hedef.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const kutu = await hedef.boundingBox();
if (kutu) {
  await page.screenshot({
    path: `${CIKTI}/zoom.png`,
    clip: { x: kutu.x - 26, y: kutu.y - 124, width: 372, height: 212 },
  });
}
console.log(JSON.stringify(kutu));
await browser.close();
