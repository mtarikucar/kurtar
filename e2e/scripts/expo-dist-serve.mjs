/**
 * A static server for `expo export -p web`'s output that understands the
 * router's dynamic segments.
 *
 * The static export writes one HTML file per route, and a dynamic route
 * lands on disk under its literal bracket name — `dist/redeem/[id].html`.
 * A plain file server therefore 404s on `/redeem/<a real id>`, which is
 * exactly the URL any screenshot of a real order has to open. This serves
 * the literal file when there is one and falls back to the directory's
 * `[param].html` when there is not.
 *
 *   node scripts/expo-dist-serve.mjs ../apps/consumer/dist 8082 http://localhost:4750
 *
 * It also proxies `/api/*` to the backend, so the page and the API share
 * an origin. That is not a convenience: the dev CORS allow-list is a
 * fixed four ports (backend/src/main.ts's DEV_DEFAULT_CORS_ORIGINS), and
 * a review build on any other port is otherwise blocked before it can
 * fetch anything. Same-origin also means no preflight, so an injected
 * Authorization header does not change the request's shape.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(process.argv[2] ?? "../apps/consumer/dist");
const PORT = Number(process.argv[3] ?? 8082);
const API = process.argv[4] ?? "http://localhost:4750";

const TURLER = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function cozumle(istekYolu) {
  const temiz = decodeURIComponent(istekYolu.split("?")[0]);
  const mutlak = path.join(KOK, temiz);
  if (fs.existsSync(mutlak) && fs.statSync(mutlak).isFile()) return mutlak;
  if (fs.existsSync(`${mutlak}.html`)) return `${mutlak}.html`;
  const dizinYolu = path.join(mutlak, "index.html");
  if (fs.existsSync(dizinYolu)) return dizinYolu;

  // /redeem/<id> -> dist/redeem/[id].html
  const dizin = path.dirname(mutlak);
  if (fs.existsSync(dizin)) {
    const dinamik = fs
      .readdirSync(dizin)
      .find((ad) => ad.startsWith("[") && ad.endsWith("].html"));
    if (dinamik) return path.join(dizin, dinamik);
  }
  const kokIndex = path.join(KOK, "index.html");
  return fs.existsSync(kokIndex) ? kokIndex : null;
}

async function vekil(istek, yanit) {
  const parcalar = [];
  for await (const parca of istek) parcalar.push(parca);
  const govde = Buffer.concat(parcalar);
  const basliklar = { ...istek.headers };
  delete basliklar.host;
  delete basliklar["content-length"];
  const cevap = await fetch(`${API}${istek.url}`, {
    method: istek.method,
    headers: basliklar,
    body: ["GET", "HEAD"].includes(istek.method ?? "GET") ? undefined : govde,
  });
  const metin = Buffer.from(await cevap.arrayBuffer());
  yanit.writeHead(cevap.status, {
    "content-type": cevap.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
  });
  yanit.end(metin);
}

http
  .createServer((istek, yanit) => {
    if ((istek.url ?? "").startsWith("/api/")) {
      vekil(istek, yanit).catch(() => yanit.writeHead(502).end("bad gateway"));
      return;
    }
    const dosya = cozumle(istek.url ?? "/");
    if (!dosya) {
      yanit.writeHead(404).end("not found");
      return;
    }
    yanit.writeHead(200, {
      "content-type": TURLER[path.extname(dosya)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(dosya).pipe(yanit);
  })
  .listen(PORT, () => console.log(`dist on http://localhost:${PORT}`));
