import { chromium } from "@playwright/test";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

// The 0/1/2/3-rescue matrix specifically — review: "judge it at 0, 1, 2
// and 3 rescues, not only at 17" (the sokak-shot.mjs full-page capture
// already covers the 17-rescue harness). A tall viewport avoids relying
// on document.body.scrollHeight, which react-native-web's own scroll
// container does not keep in sync with the rendered content.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 9000 }, deviceScaleFactor: 2 });
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1200);

const baslikBox = await page.getByText("DÜŞÜK SAYIM", { exact: false }).boundingBox();
const sonKart = page.getByText("3 KURTARMA", { exact: false }).last();
const sonKartBox = await sonKart.boundingBox();
// The last card's own bottom edge, not a guessed page height.
const sonRowBox = await sonKart.locator("xpath=..").boundingBox();

if (baslikBox && sonKartBox && sonRowBox) {
  const altSinir = sonRowBox.y + sonRowBox.height;
  await page.screenshot({
    path: `${OUT}/sokak-dusuk-sayim-full.png`,
    clip: { x: 0, y: Math.max(0, baslikBox.y - 10), width: 390, height: altSinir - baslikBox.y + 10 },
  });
  console.log("shot: sokak-dusuk-sayim-full.png");
} else {
  console.error("Could not locate the DÜŞÜK SAYIM matrix — has the harness moved?");
  process.exitCode = 1;
}

await browser.close();
