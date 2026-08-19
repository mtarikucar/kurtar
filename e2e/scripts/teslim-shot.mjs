/**
 * Screenshots Track B's screens — offer detail, purchase, the sold-out
 * race, the purchase confirmation, and the redeem kepenk in BOTH states —
 * against the real API and the real web build, at 390pt.
 *
 *   cd apps/consumer && EXPO_PUBLIC_API_BASE_URL=http://localhost:8082 \
 *     npx expo export -p web --clear
 *   cd e2e && node scripts/expo-dist-serve.mjs ../apps/consumer/dist 8082 &
 *   node scripts/teslim-shot.mjs /tmp/teslim
 *
 * Run from the e2e workspace so @playwright/test resolves.
 *
 * Two things are stubbed and nothing else:
 *
 *  • **The session.** expo-secure-store has no web implementation (its web
 *    module is an empty object), so the consumer app cannot HOLD a session
 *    in a browser at all — sign-in is a device-only path. Rather than
 *    patch the app for the sake of a screenshot, this signs in over the
 *    real API and attaches the resulting bearer to every /api request the
 *    page makes.
 *  • **One `OFFER_UNAVAILABLE`**, to photograph §4.4's money-path failure
 *    without eating the shared seed's last bag. The screen, the client and
 *    the error mapping are the real ones; only the 409 is planted.
 *
 * Everything else — the offer, the reservation, the payment webhook, the
 * pickup window, the code — is real data created through the real API,
 * and every row this script creates is deleted again at the end.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Client as PgClient } from "pg";

/** The API as the SCRIPT reaches it (direct), and as the PAGE reaches it
 * (same-origin, through the review server's own /api proxy — see
 * expo-dist-serve.mjs for why that proxy has to exist). */
const API = process.env.TESLIM_API ?? "http://localhost:4750";
const APP = process.env.TESLIM_APP ?? "http://localhost:8082";
const LOG = process.env.TESLIM_BACKEND_LOG ?? "/tmp/kurtar-backend-e2e.log";
const WEBHOOK_SECRET = process.env.TESLIM_WEBHOOK_SECRET ?? "e2e-ci-webhook-secret";
const DB =
  process.env.TESLIM_DATABASE_URL ??
  "postgresql://kurtar:kurtar@localhost:4754/kurtar";
const MERCHANT_EMAIL = "hakan@modafirin.demo.kurtar.app";
const DEMO_PASSWORD = "KurtarDemo123!";
const CIKTI = process.argv[2] ?? "/tmp/teslim";
const KADIKOY = { lat: 40.9906, lng: 29.027 };

fs.mkdirSync(CIKTI, { recursive: true });
const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

async function api(yol, { yontem = "GET", govde, token } = {}) {
  const yanit = await fetch(`${API}${yol}`, {
    method: yontem,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const metin = await yanit.text();
  if (!yanit.ok) throw new Error(`${yontem} ${yol} -> ${yanit.status} ${metin}`);
  return metin ? JSON.parse(metin) : null;
}

/** The mock SMS provider logs the code, in the clear, by design — it is
 * never in an HTTP response (see otp.service.ts's security note). */
function sonOtp(sonEk) {
  const satirlar = fs.readFileSync(LOG, "utf8").split("\n");
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    const eslesme = satirlar[i].match(/OTP for \+90\*+(\d+): (\d{6})/);
    if (eslesme && eslesme[1] === sonEk) return eslesme[2];
  }
  return null;
}

function istanbulGunu(an) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(an);
}

async function girisYap() {
  const telefon = `+9055${Date.now().toString().slice(-8)}`;
  await api("/api/auth/otp/request", { yontem: "POST", govde: { phone: telefon } });
  let kod = null;
  for (let i = 0; i < 20 && !kod; i += 1) {
    await bekle(250);
    kod = sonOtp(telefon.slice(-2));
  }
  if (!kod) throw new Error(`OTP not found in ${LOG} for ${telefon}`);
  const oturum = await api("/api/auth/otp/verify", {
    yontem: "POST",
    govde: { phone: telefon, code: kod },
  });
  return { telefon, token: oturum.accessToken };
}

/**
 * The seeded demo offers all run 19:00–21:00, so at any working hour they
 * are AÇILMADI and the redeem shutter is bolted — which is one of the two
 * states, but not the one the design is about. This publishes a real
 * offer whose window is open NOW, as the seeded Moda Fırın merchant,
 * exactly the way the money-loop test does.
 */
async function canliTeklifYayinla() {
  const giris = await api("/api/auth/merchant/login", {
    yontem: "POST",
    govde: { email: MERCHANT_EMAIL, password: DEMO_PASSWORD },
  });
  const ben = await api("/api/merchants/me", { token: giris.accessToken });
  const dukkan = ben.stores.find((d) => d.name === "Moda Fırın") ?? ben.stores[0];

  const isaret = Date.now().toString(36);
  const sablon = await api("/api/bag-templates", {
    yontem: "POST",
    token: giris.accessToken,
    govde: {
      storeId: dukkan.id,
      title: `Fırından Sürpriz Paket ${isaret}`,
      category: "BAKERY",
      allergenDisclaimer:
        "Gluten, süt, yumurta ve fındık içerebilir. Alerjin varsa teslim alırken personele mutlaka sor.",
      originalValueCentsMin: 15000,
      originalValueCentsMax: 22000,
      priceCents: 6900,
    },
  });

  const simdi = new Date();
  // pickupStartAt must be strictly in the future at creation
  // (offer-window.rules.ts); eight seconds is comfortably past by the
  // time the browser opens anything, and the script waits out the rest.
  const baslangic = new Date(simdi.getTime() + 8_000);
  const bitis = new Date(simdi.getTime() + 100 * 60_000);
  const teklif = await api("/api/offers", {
    yontem: "POST",
    token: giris.accessToken,
    govde: {
      bagTemplateId: sablon.id,
      offerDate: istanbulGunu(simdi),
      qtyTotal: 4,
      pickupStartAt: baslangic.toISOString(),
      pickupEndAt: bitis.toISOString(),
    },
  });
  await api(`/api/offers/${teklif.id}/publish`, {
    yontem: "POST",
    token: giris.accessToken,
    govde: {},
  });
  return { teklifId: teklif.id, dukkanId: dukkan.id, sablonId: sablon.id, baslangic };
}

/** This runs against the shared demo database. Everything it created goes
 * back out again, so the seed a colleague is looking at is the seed they
 * left. */
async function temizle(kimlikler) {
  const pg = new PgClient({ connectionString: DB });
  await pg.connect();
  try {
    await pg.query('DELETE FROM "payments" WHERE "reservationId" = $1', [
      kimlikler.reservationId,
    ]);
    await pg.query('DELETE FROM "reservations" WHERE "id" = $1', [
      kimlikler.reservationId,
    ]);
    await pg.query('DELETE FROM "daily_offers" WHERE "id" = $1', [kimlikler.teklifId]);
    await pg.query('DELETE FROM "bag_templates" WHERE "id" = $1', [kimlikler.sablonId]);
    await pg.query('DELETE FROM "users" WHERE "phoneE164" = $1', [kimlikler.telefon]);
  } finally {
    await pg.end();
  }
}

// ---------------------------------------------------------------------

const oturum = await girisYap();
const canli = await canliTeklifYayinla();
await bekle(Math.max(0, canli.baslangic.getTime() - Date.now() + 1500));

const liste = await api(
  `/api/discovery/offers?lat=${KADIKOY.lat}&lng=${KADIKOY.lng}&radiusM=8000&page=1&pageSize=30`,
);
const teklif = liste.items.find((o) => o.offerId === canli.teklifId);
if (!teklif) throw new Error("the freshly published offer is not in discovery yet");

const rezervasyon = await api("/api/reservations", {
  yontem: "POST",
  govde: { offerId: teklif.offerId, qty: 1 },
  token: oturum.token,
});
await fetch(`${API}/api/webhooks/payment`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
  body: JSON.stringify({
    merchantOid: rezervasyon.payment.merchantOid,
    status: "success",
    totalCents: rezervasyon.totalCents,
    eventId: randomUUID(),
  }),
});
console.log(
  "offer",
  teklif.offerId,
  teklif.store.name,
  "| reservation",
  rezervasyon.reservationId,
  rezervasyon.code,
);

const tarayici = await chromium.launch();
const baglam = await tarayici.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(process.env.TESLIM_DSF ?? 3),
  // react-native-web's responder system (what PanResponder rides on) is
  // touch-first; without this the page has no Touch constructor at all.
  hasTouch: true,
  isMobile: true,
});
await baglam.route(`${APP}/api/**`, async (yol) => {
  const istek = yol.request();
  await yol.continue({
    headers: { ...istek.headers(), authorization: `Bearer ${oturum.token}` },
  });
});

const hatalar = [];
async function sayfa() {
  const s = await baglam.newPage();
  s.on("console", (m) => {
    if (m.type() === "error") hatalar.push(m.text());
  });
  s.on("pageerror", (e) => hatalar.push(String(e)));
  return s;
}

async function cek(s, ad, ms = 2200) {
  await bekle(ms);
  await s.screenshot({ path: `${CIKTI}/${ad}.png` });
  console.log("shot", ad);
}

/** react-native-web scrolls INSIDE a div, so the window never moves and
 * `mouse.wheel` does nothing to a ScrollView. */
async function kaydir(s, y) {
  const sonuc = await s.evaluate((hedef) => {
    const hepsi = [...document.querySelectorAll("div")];
    const kutu = hepsi.reduce(
      (en, d) =>
        d.scrollHeight > d.clientHeight + 40 &&
        d.scrollHeight - d.clientHeight > (en ? en.scrollHeight - en.clientHeight : 0)
          ? d
          : en,
      null,
    );
    if (!kutu) return "no scroller";
    kutu.scrollTop = hedef;
    return `scrolled to ${kutu.scrollTop} of ${kutu.scrollHeight - kutu.clientHeight}`;
  }, y);
  console.log("scroll:", sonuc);
}

try {
  // ---- 1. TEKLİF DETAYI ----------------------------------------------
  const detay = await sayfa();
  await detay.goto(
    `${APP}/offer/${teklif.offerId}?storeId=${teklif.store.id}&distanceM=${teklif.store.distanceM}`,
    { waitUntil: "domcontentloaded" },
  );
  await cek(detay, "01-teklif-detayi-ust");
  await kaydir(detay, 620);
  await cek(detay, "02-teklif-detayi-orta", 900);
  await kaydir(detay, 1300);
  await cek(detay, "03-teklif-detayi-alt", 900);

  // ---- 2. SATIN ALMA -------------------------------------------------
  const alim = await sayfa();
  await alim.goto(`${APP}/purchase/${teklif.offerId}?storeId=${teklif.store.id}`, {
    waitUntil: "domcontentloaded",
  });
  await cek(alim, "04-satin-alma");

  // ---- 3. AZ ÖNCE KAPANDI (§4.4's money-path failure) -----------------
  const kapandi = await sayfa();
  await kapandi.route(`${APP}/api/reservations`, async (yol) => {
    if (yol.request().method() !== "POST") return yol.fallback();
    await yol.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 409,
        errorCode: "OFFER_UNAVAILABLE",
        message: "This offer is no longer available.",
      }),
    });
  });
  await kapandi.goto(`${APP}/purchase/${teklif.offerId}?storeId=${teklif.store.id}`, {
    waitUntil: "domcontentloaded",
  });
  await bekle(1800);
  await kapandi.getByTestId("purchase-consent-checkbox").click();
  await kapandi.getByTestId("purchase-confirm").click();
  await cek(kapandi, "05-az-once-kapandi", 2600);

  // ---- 4. SATIN ALMA ONAYI (§4.4) ------------------------------------
  const onay = await sayfa();
  await onay.goto(
    `${APP}/payment/${rezervasyon.reservationId}?redirectUrl=&code=${rezervasyon.code}`,
    { waitUntil: "domcontentloaded" },
  );
  await cek(onay, "06-satin-alma-onayi-roll", 1700);
  await cek(onay, "07-satin-alma-onayi", 1800);

  // ---- 5. KEPENK, both states ----------------------------------------
  const kepenk = await sayfa();
  await kepenk.goto(`${APP}/redeem/${rezervasyon.reservationId}`, {
    waitUntil: "domcontentloaded",
  });
  await cek(kepenk, "08-kepenk-kapali", 2600);

  // react-native-web's AccessibilityInfo reports a screen reader as
  // ALWAYS present (it cannot detect one, so it assumes the accessible
  // path), which means the browser gets §4.5's plain-button substitute
  // rather than the drag. That is the substitution working, so it is what
  // gets driven here; the 140pt threshold and its release behaviour are
  // proven in teslim-perde.test.ts and teslim-kepenk-ekrani.test.tsx.
  const dugme = kepenk.getByTestId("kepenk-kol-dugmesi");
  const suruklenir = kepenk.getByTestId("kepenk-kol-suruklenir");
  if ((await dugme.count()) > 0) {
    console.log("handle: accessible button substitute");
    await dugme.click();
  } else {
    console.log("handle: drag");
    const kutu = await suruklenir.boundingBox();
    if (!kutu) throw new Error("no handle on screen — is the pickup window open?");
    const x = kutu.x + kutu.width / 2;
    const y = kutu.y + kutu.height / 2;
    await kepenk.mouse.move(x, y);
    await kepenk.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await kepenk.mouse.move(x, y - i * 15);
      await bekle(16);
    }
    await kepenk.mouse.up();
  }
  await cek(kepenk, "09-kepenk-roll", 300);
  await cek(kepenk, "10-kepenk-acik", 1400);
  await cek(kepenk, "11-kepenk-acik-sonra", 1600);

  console.log(JSON.stringify({ hatalar: [...new Set(hatalar)] }, null, 2));
} finally {
  await tarayici.close();
  if (!process.env.TESLIM_KEEP) {
    await temizle({
      reservationId: rezervasyon.reservationId,
      teklifId: canli.teklifId,
      sablonId: canli.sablonId,
      telefon: oturum.telefon,
    });
    console.log("cleaned up the rows this run created");
  }
}
