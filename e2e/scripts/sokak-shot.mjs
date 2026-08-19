import { chromium } from "@playwright/test";
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-shots";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 3200 }, deviceScaleFactor: 2 });
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/sokak-inceleme-full.png`, fullPage: true });
console.log("shot: sokak-inceleme-full.png");
await browser.close();
