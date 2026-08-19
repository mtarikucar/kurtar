import { chromium } from "@playwright/test";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// 1x scale — what the phone actually renders, not a 4x-aided close-up.
const page = await browser.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1200);

for (const etiket of ["GECE", "GÜNDÜZ"]) {
  const baslik = page.getByText(etiket, { exact: true });
  const box = await baslik.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/sokak-1x-${etiket}.png`,
      clip: { x: 0, y: box.y, width: 390, height: 160 },
    });
    console.log(`shot: sokak-1x-${etiket}.png`);
  }
}

await browser.close();
