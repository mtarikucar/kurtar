import { chromium } from "@playwright/test";
import fs from "node:fs";

/**
 * SENİN SOKAĞIN at reading distance and then at six times it.
 *
 * The street's whole job is a drawing, and the review that produced this
 * pass was only possible once the drawing was photographed large enough
 * to see: a 40pt strip photographed at 1x says nothing about whether an
 * awning reads as an awning. Every card in /sokak-inceleme's low-count
 * matrix is captured individually at deviceScaleFactor 6, plus the rich
 * 17-rescue fixture in each of the three palettes.
 */
const URL = process.env.PANEL_URL ?? "http://localhost:8095";
const OUT = process.argv[2] ?? "/tmp/sokak-detay";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 12000 },
  deviceScaleFactor: 6,
});
await page.goto(`${URL}/sokak-inceleme`, { waitUntil: "load" });
await page.waitForTimeout(1500);

async function cek(ad, metin, sira, yukseklik) {
  const hedefler = await page.getByText(metin, { exact: false }).all();
  const hedef = hedefler[sira];
  if (!hedef) return console.error(`bulunamadi: ${metin} #${sira}`);
  const kutu = await hedef.boundingBox();
  if (!kutu) return console.error(`kutusuz: ${metin} #${sira}`);
  await page.screenshot({
    path: `${OUT}/${ad}.png`,
    clip: { x: 0, y: kutu.y - 4, width: 390, height: yukseklik },
  });
  console.log(`shot: ${ad}.png @ y=${Math.round(kutu.y)}`);
}

// Low-count matrix: gece first (index 0..3), then gündüz (4..7).
const sayimlar = ["0", "1", "2", "3"];
for (let i = 0; i < sayimlar.length; i += 1) {
  await cek(`gece-${sayimlar[i]}kurtarma`, `${sayimlar[i]} KURTARMA`, 0, 150);
  await cek(`gunduz-${sayimlar[i]}kurtarma`, `${sayimlar[i]} KURTARMA`, 1, 150);
}

// The rich fixture, one capture per palette.
const fazlar = ["GECE", "ALACAKARANLIK", "GÜNDÜZ"];
for (let i = 0; i < fazlar.length; i += 1) {
  await cek(`zengin-${fazlar[i].toLowerCase()}`, fazlar[i], 0, 190);
}

await browser.close();
