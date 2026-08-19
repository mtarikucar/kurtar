# Running the consumer app on a real phone

The browser preview (`npm run web -w consumer`) is a review surface, not the
product. The map is a placeholder there, push notifications do not exist, and
the session cannot survive a page reload. Everything below is about getting
the real thing onto a real device.

## 0. The one thing that will otherwise make you think the app is broken

**The seeded surprise bags open at 19:00 and close at 21:00, local Istanbul
time** (`backend/prisma/seed-demo.ts`). Outside that window every shop is
correctly shut: shutters down, "19:00'da açılıyor", no countdown. That is the
app telling the truth, not an empty database.

To see the app at the hour it was designed for — shutters up, sodium light
under them, `SON 25 DK` — without waiting for sunset, pin the clock at build
time:

```bash
EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T17:35:00.000Z   # 20:35 Istanbul
```

That goes through `ClockProvider`'s own `sabitZaman`, so one instant governs
the palette, every countdown and every open/closed label at once. Use the
date you seeded on. `EXPO_PUBLIC_FAZ_ZORLA=gece|alacakaranlik|gunduz` pins the
palette alone, leaving the clock real. A normal build inlines `undefined` for
both and the app follows the sun.

**Do not fake the device or browser clock instead.** `Date.now()` freezes
while the clock provider's minute bucket keeps the old time, and the screen
ends up disagreeing with itself about what time it is.

## 1. Backend the phone can actually reach

```bash
./scripts/dev-up.sh          # PostGIS + Redis + migrations + demo seed + API on :4750
```

`.env`'s `EXPO_PUBLIC_API_BASE_URL=http://localhost:4750` is correct for the
browser and **useless from a phone** — `localhost` is the phone. Point it at
the machine's LAN address:

```bash
ip -4 addr show scope global | grep -oP 'inet \K[\d.]+' | head -1   # e.g. 192.168.1.24
```

The value is the **origin only, with no `/api` suffix** — the client appends
it. With the suffix every request becomes `/api/api/...` and 404s, which
surfaces only as "the login button does nothing".

Phone and machine must be on the same network, and the machine's firewall
must allow :4750. If they cannot share a network, tunnel it (`npx expo start
--tunnel` covers the bundler; the API needs its own tunnel, e.g. `cloudflared
tunnel --url http://localhost:4750`, and then that URL is the base).

## 2. Fastest look: Expo Go (design only)

```bash
cd apps/consumer
EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:4750 npx expo start
```

Scan the QR with Expo Go (install it from the phone's own app store). You get
real native rendering, real touch targets, real safe-area insets — which is
what the browser cannot tell you.

What Expo Go will NOT give you: push notifications (removed from Expo Go on
Android in SDK 53), and any behaviour that depends on this app's own native
config. Treat it as a design review, not a functional test.

## 3. A real installable app: EAS Build

No Android SDK, Xcode or emulator is needed locally — the build runs on
Expo's servers.

```bash
npm i -g eas-cli && eas login
cd apps/consumer && eas build:configure          # writes eas.json
eas build --profile preview --platform android   # APK, installable directly
```

The finished build is offered as a QR/link that **the phone downloads over
its own connection**, so a restrictive network on the build machine does not
block the install.

iOS cannot be built or simulated on Linux at all. It needs an Apple Developer
account ($99/yr) plus a D-U-N-S number for the organisation — that D-U-N-S
application is on the launch checklist's critical path and takes 1–2 weeks,
so start it before you need it. After that, `--platform ios` plus TestFlight.

## 4. Signing in

Consumer accounts are phone + OTP. The mock SMS provider never sends a real
message: the 6-digit code is printed to the **backend's console**
(`kurtar dogrulama kodunuz: XXXXXX`) and is deliberately never echoed in the
HTTP response — echoing it was an unauthenticated account-takeover hole and
it was closed (`backend/src/modules/otp/otp.service.ts`).

Seeded consumers are listed in `backend/prisma/seed-demo.ts`. Two worth
knowing:

| phone | what it shows |
|---|---|
| `+90 555 111 00 04` | a rescued bag, past orders, and therefore a lit first shop on SENİN SOKAĞIN |
| `+90 555 111 00 02` | a CONFIRMED reservation inside a live pickup window — open it to reach the redeem screen |

Any unseeded number creates a fresh empty account, which is a fine way to
check the first-run states (empty favourites, empty orders, an unbuilt
street).

## 5. If a frame looks wrong, check these before believing it

Three ways to photograph or demo something that is not what the code says,
all of which have already caught someone on this project:

- **`expo export` caches inlined `EXPO_PUBLIC_*` values through Metro.** If
  the source did not change, a rebuild silently keeps the previous value and
  prints "Exported: dist" while shipping the old one. Always pass `--clear`,
  and prove which value landed:
  `grep -c '<the value>' dist/_expo/static/js/web/*.js`.
- **A server that cannot bind a taken port exits quietly** while `curl` keeps
  answering 200 from whatever already holds it. `ss -ltnp | grep <port>` names
  the process; `ps aux | grep expo-dist-serve` names its document root.
- **On web the session does not survive a page reload** (`expo-secure-store`
  has no web implementation, so the refresh token lives in memory for the
  tab's life). Navigate by tapping, not by reloading.
