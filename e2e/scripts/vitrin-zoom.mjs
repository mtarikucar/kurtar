/**
 * A 4× close-up of one card on the review screen, for looking at the
 * corrugation, the lip, the plaque bolts and the glyph.
 *
 *   cd e2e && node scripts/vitrin-zoom.mjs /tmp/vitrin
 */
import { chromium } from "@playwright/test";
const CIKTI = process.argv[2] ?? "/tmp/shots";
const URL = process.env.VITRIN_URL ?? "http://localhost:8081/vitrin";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 4 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const hedef = page.getByText("MODA FIRIN").first();
await hedef.scrollIntoViewIfNeeded();
const kutu = await hedef.boundingBox();
if (kutu) {
  await page.screenshot({
    path: `${CIKTI}/zoom-firin.png`,
    clip: { x: kutu.x - 24, y: kutu.y - 122, width: 372, height: 210 },
  });
}
console.log(JSON.stringify(kutu));
await browser.close();
