/**
 * Crops the four-state light comparison on the review screen — the check
 * problem 1 has to pass: cover the pills, and the closing shop still has
 * to be the brightest thing in the row.
 */
import { chromium } from "@playwright/test";
const CIKTI = process.argv[2] ?? "/tmp/shots";
const URL = process.env.VITRIN_URL ?? "http://localhost:8081/vitrin";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 3 });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const baslik = page.getByText("IŞIK — aynı dükkân, dört durum");
await baslik.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const kutu = await baslik.boundingBox();
if (kutu) {
  await page.screenshot({ path: `${CIKTI}/isik-karsilastirma.png`, clip: { x: kutu.x - 4, y: kutu.y - 8, width: 1240, height: 240 } });
  // …and the band alone, pills and all text cropped away.
  await page.screenshot({ path: `${CIKTI}/isik-sadece-bant.png`, clip: { x: kutu.x - 4, y: kutu.y + 42, width: 1240, height: 84 } });
}
console.log(JSON.stringify(kutu));
await browser.close();
