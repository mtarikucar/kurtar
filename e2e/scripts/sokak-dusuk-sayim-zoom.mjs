import { chromium } from "@playwright/test";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

// A 4x close-up on the "1 KURTARMA" card in both gece and gündüz — the
// exact state the review named ("one 26pt box alone under a month
// label"), close enough to read the awning colour and window brightness
// against each ground.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 9000 }, deviceScaleFactor: 4 });
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1200);

const etiketler = await page.getByText("1 KURTARMA", { exact: false }).all();
for (let i = 0; i < etiketler.length; i += 1) {
  const box = await etiketler[i].boundingBox();
  if (!box) continue;
  await page.screenshot({
    path: `${OUT}/sokak-1kurtarma-zoom-${i}.png`,
    clip: { x: 0, y: box.y - 6, width: 260, height: 90 },
  });
  console.log(`shot: sokak-1kurtarma-zoom-${i}.png @ y=${box.y}`);
}
await browser.close();
