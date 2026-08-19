import { chromium } from "@playwright/test";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 4 });
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1200);

// Zoom on the GECE (night) block specifically.
const geceBaslik = page.getByText("GECE", { exact: true });
const box = await geceBaslik.boundingBox();
if (box) {
  await page.screenshot({
    path: `${OUT}/sokak-zoom-gece.png`,
    clip: { x: 0, y: box.y, width: 390, height: 160 },
  });
  console.log("shot: sokak-zoom-gece.png");
}

await browser.close();
