# Build log — alacakaranlık: type follows the surface, not the phase

> **The frames these notes cite are not in this repository.** Every
> screenshot named below (`02-kesif-liste-gece.png` and its siblings) was
> written to a scratch directory under `/tmp` by the scripts in
> `e2e/scripts/`, and `/tmp` does not survive a reboot. They were not
> committed: they are hundreds of near-identical 2x PNGs of a UI that
> keeps changing, and a stale frame in a repo is worse than no frame,
> because it looks like current evidence.
>
> So a filename here is a record of what was looked at, not something a
> later reader can open. To see any of it again, re-run the script named
> in the section — the build flags that pin the clock and the palette
> (`EXPO_PUBLIC_INCELEME_ZAMANI`, `EXPO_PUBLIC_FAZ_ZORLA`) exist precisely
> so the same frame can be reproduced on demand rather than archived. See
> `docs/consumer-on-a-phone.md` for the traps that make a rebuild
> photograph something other than what you think.



Branch `fix/alacakaranlik-kontrast`. Spec §1.1 is binding throughout.

## The defect, and the shape of it

`ALACAKARANLIK` inherited `yaziAna: #12181F` / `yaziSis: #4B5A58` from
`GUNDUZ`. Those are right on its card — the ivory `#E3DAC8` sign, where
they measure 12.86:1 and 5.21:1. They are not right anywhere else,
because this is the one phase whose card and whose grounds fall on
opposite sides of mid-lightness:

| pair | ratio | |
|---|---|---|
| `yaziSis` on `bgAsfalt` `#7A868C` | **1.93** | fail |
| `yaziSis` on `bgDerin` `#5F6B72` | **1.32** | fail |
| `yaziAna` on `bgDerin` | **3.26** | large text only |
| `yaziAna` on `bgAsfalt` | 4.78 | ok |

Two more of the same defect turned up in the sweep and are fixed here:

| pair | ratio | where |
|---|---|---|
| `sodyumYazi` on `bgAsfalt` | **1.83** | every price and impact figure on the street |
| `yaziSis` on `hapZemin` | **2.47** | the sub-label under the redeem handle, in BOTH light phases |

And one in daylight:

| `yaziSis` on `bgDerin` `#B4BEC1` | **3.82** | the redeem/confirmation interiors at noon |

## What was built

Three type families, keyed on the SURFACE a call site paints on rather
than on the phase:

| | card / panel | street `bgAsfalt` | recess `bgDerin` |
|---|---|---|---|
| primary | `yaziAna` | `yaziAnaZemin` | `yaziAnaCukur` |
| secondary | `yaziSis` | `yaziSisZemin` | `yaziSisCukur` |
| money | `sodyumYazi` | `sodyumYaziZemin` | `sodyumYaziCukur` |

plus `hapYaziSis` — secondary type on the zinc plate that carries the
time pill and the redeem handle, which is `#12181F` in every phase.

`src/design/zemin.ts` turns "which surface am I on" into a named argument
(`zemin: "kart" | "sokak" | "cukur"`) for the six primitives that are
genuinely mounted on more than one: `Dugme`, `IkonDugmesi`,
`BolumBasligi`, `PanelButton`, `PanelPill`, `DegerCubugu`.

### Values

| token | gece | alacakaranlık | gündüz |
|---|---|---|---|
| `yaziAnaZemin` | `#F2E6CE` | `#0E141A` | `#12181F` |
| `yaziSisZemin` | `#9FB0AC` | `#12181F` | `#4B5A58` |
| `yaziAnaCukur` | `#F2E6CE` | `#F2E6CE` | `#12181F` |
| `yaziSisCukur` | `#9FB0AC` | `#B4C2BE` | `#3B4745` |
| `sodyumYaziZemin` | `#FFB23F` | `#281501` | `#7A4104` |
| `sodyumYaziCukur` | `#FFB23F` | `#FFB23F` | `#6E3A04` |
| `hapYaziSis` | `#9FB0AC` | `#9FB0AC` | `#9FB0AC` |
| `bgDerin` | `#0E141A` | `#212A31` *(was `#5F6B72`)* | `#B4BEC1` |

**Every gece value is the value the call site already had.** The night
palette is unchanged by construction, not by inspection, and
design-contrast.test.ts asserts each of the seven identities.

## Why three families and not the two that were asked for

The brief asked for one ground family covering `bgAsfalt` and `bgDerin`.
That is arithmetically impossible in this phase, and the impossibility is
worth stating precisely because it is the whole design constraint:

- `#7A868C` (L = 0.230) reaches **5.62:1 against pure black** and
  **3.74:1 against pure white**. No light ink can carry body type on the
  dusk street at all — so the street ink must be dark.
- With a dark ink, any ground DARKER than `#7A868C` falls away fast:
  `#5F6B72` gives 3.26:1 with the palette's deepest zinc and 3.83:1 with
  pure black.

So one ink cannot serve both, and the only way to make it serve both
would be to raise `bgDerin` to within ~7% of `bgAsfalt`'s luminance,
which erases the recess the map and the redeem screen depend on.

`yaziAnaZemin` / `yaziSisZemin` therefore keep the names and the meaning
the brief gave them — the street ground — and the recess gets its own
pair. Structurally this is the same device §1.1 already uses for red
(`tenteYazi` + `tenteYaziZemini`: an ink declared next to the one surface
it is legal on).

## Why the twilight recess moved, and `bgAsfalt` did not

`bgAsfalt` is untouched: `#C7D0D2 → #7A868C → #12181F` is the sunset and
the palette's spine.

`bgDerin` moved from `#5F6B72` to `#212A31`, because at `#5F6B72`
**nothing could be written on it**, in or out of the palette. The redeem
screen writes both on the bare recess (the district line, above the
opening) and inside the shop's own lamp, so an ink there has to clear the
floor in both states:

| ink | unlit | under the lamp |
|---|---|---|
| pure black | 3.83 | 4.97 |
| pure white | 5.48 | 4.23 |
| sign ivory `#F2E6CE` | 4.43 | 3.42 |
| deepest zinc `#12181F` | 3.26 | 4.23 |

Every row has a number under 4.5. A mid-slate recess is not a ground you
can write on.

The direction it moved in is the one dusk actually goes: **interiors go
dark before the street does.** At 19:45 the sky is still on the road and
already off behind the glass. `#212A31` is 3.90:1 against the street it
recedes from and only 1.27:1 against gece's own `#0E141A`, so it is a
recess without being night; lit ivory reads 11.79:1 on it unlit and
7.32:1 under the shop's own lamp.

## What the dusk street cannot have, and what it got instead

`#7A868C` has 5.62:1 of total range and the primary spends 4.95 of it.
The remaining band for a second tonal level is **0.18 of a ratio point**.
There is no tonal hierarchy to be had on this ground, and none is faked:
`yaziAnaZemin` is 4.95:1 and `yaziSisZemin` 4.78:1, and the hierarchy is
carried by the type scale (Chivo Mono 12 `data` against Archivo 15/17)
where it belongs at this luminance. The test pins the ceiling as well as
the floor, so a future "make the secondary softer" fails loudly.

The same ceiling is why money on the dusk street is `#281501` — the
sodium lamp cooked down to what a mid-slate will hold (4.69:1). It
separates from the zinc beside it by **temperature**, which is the only
axis `#7A868C` leaves. The sodium FILLS are untouched, so the value bar,
the CTA and the selected chip still put real amber on the screen.

## The classification rule applied at every call site

> Is this text inside something the app PAINTED, or on the ground?

- painted → `yaziAna` / `yaziSis` (`yuzeyKaldirim`, `yuzeyYukselti`, a
  `<Blok/>`, an order row, the ticket, an input field, the offer card's
  pavement block);
- the street → `*Zemin` (anything not inside a painted object, including
  on screens that also have cards — only the text OUTSIDE the card moved);
- the recess → `*Cukur` (`bgDerin`: map water, the price pin, the web map
  pane, the redeem and confirmation interiors).

**94 references moved to the street family and 25 to the recess**, across
46 files; 20 call sites pass the surface explicitly to a shared
primitive. Nothing was renamed with `sed` — every site was read against
the View that paints behind it.

Sites deliberately LEFT on the card family, each because the enclosing
View paints a surface: `HaritaSatiri` (the map sheet is `yuzeyYukselti`),
`MenuRow` in Profil, `SaatButonu` in bildirim tercihleri, the merchant
side of a complaint thread, the redeem screen's offline notice, the
allergen and quantity blocks behind `<Blok/>`, `AlisPenceresi`,
`DetayBasligi`, `OrderRow`, `ComplaintRow`, `VitrinKarti`, `StokCipi`.
`HataSokagi` moved to `plakaYazi` instead: its words are on the paper
note taped to the shutter, which is a plaque, not a ground (identical
value in all three phases, so this is a naming fix, not a colour change).

## The test

`design-contrast.test.ts` is no longer a list of remembered pairs. It is
a table of every (ink, ground) pair that exists in the render tree, each
row naming the files that produce it and the `yazi` tokens it is set in.
The floor is DERIVED from those tokens — a row may only take the 3:1
floor if every size on it is genuinely ≥24px or ≥18.66px bold — so "this
is large text" is checked rather than claimed.

Result: **no row that carries words leans on the large-text exemption.**
Four rows take 3:1 and all four are non-text (icon strokes, a 36pt glyph,
the clock's pulse bar, the switch thumb). The 56pt clock and the 44pt
code would have been allowed 3:1 and clear 4.5:1 anyway.

`teslim-acik-dukkan.test.ts`'s conditional floors are now unconditional,
and its pinned list of grounds that failed —
`["alacakaranlik/yaziSis", "alacakaranlik/yaziAna", "gunduz/yaziSis"]` —
is now empty. That hole was reported in `build-log-teslim.md` as a
palette change that branch could not make; this is the branch that made
it.

`npx tsc --noEmit`, `npx jest` (810 tests, 45 suites) and `npx expo lint`
are clean.

## What the frames actually showed

Built with `EXPO_PUBLIC_FAZ_ZORLA=alacakaranlik` +
`EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T16:45:00.000Z` (19:45 İstanbul —
inside dusk AND inside the seeded 19:00–21:00 pickup window), walked with
`e2e/scripts/tam-gezinti.mjs`, which now takes `alacakaranlik` and now
walks the money loop to an open shutter.

- **Keşfet.** The header `◉ KADIKÖY ⌄` and the `19:45` clock are both
  crisp near-black on the dusk slate; the clock was the 1.93:1 ghost.
  `2 dükkân açık`, the unselected chips, `KADIKÖY` / `BEŞİKTAŞ` section
  rules and the `1,3 km` / `6,1 km` spine labels all read at arm's
  length. The ivory cards are untouched — plaque, `69₺`, `×2,7 değer`,
  the value band, the meta rail, `son 6`. The collapsing map header is
  now visibly a RECESS with ivory type in it rather than a grey panel
  with unreadable dark type.
- **Harita.** The pane carries `Harita`, both body lines and the `Liste`
  button in lit ivory on `#212A31`; the bottom sheet below it stays ivory
  with card type, sodium prices and dark zinc time pills. The two
  surfaces now read as two different materials, which is the point.
- **Teklif detayı.** `VİTRİN — BU KUTUDA NE OLABİLİR?`, the package name,
  the category line and the two-sentence explanation are all legible on
  the street. `69₺` reads as a deep warm brown rather than amber — the
  honest consequence of the ceiling — while the value bar beside it keeps
  the bright sodium fill, so the money still has amber on the screen. The
  pickup-window block is unchanged card type: `BUGÜN 19:00 ——▲—— 21:00`,
  `şimdi 19:45`, `Kepenk 1 sa 15 dk sonra iniyor`.
- **Sipariş­ler.** Title and both section labels (`AKTİF`, `GEÇMİŞ`) read
  on the street; the rows stay ivory with `Kod: K-VLCR` in card grey, the
  outline status pill and the KURTARILDI stamp.
- **Profil / Etki.** `Profil`, `Telefon: …`, `SENİN SOKAĞIN`,
  `Ağustos 2026` and `AYARLAR` are all legible where the `data`/`label`
  lines were previously a smear. The three impact figures
  (`1 paket` / `2,5 kg yemek` / `141₺`) sit in the burnt sodium with
  their captions in cool zinc beneath — the money reads as warm against
  the cool type, and `En sık kurtardığın saat 19:15` / `Caferağa Kahve
  Evi · 1 kez` separate by face rather than by tone.
- **Ödeme.** `Ödeme` and both waiting lines read on the street. (The red
  "React Native WebView does not support this platform." is the library's
  own web stub, not styling.)
- **Onay (satın alma onayı).** The lit interior with ivory type:
  `Fırından Sürpriz Paket · 1 adet`, `BUGÜN 19:00–21:00 arası al`, and
  `69₺ ödendi · #K-NT66` in the recess sodium — bright amber on the warm
  room. `Kendi çantanı getir` and `Siparişlerim'de de duruyor` are the
  cool pale zinc secondary: clearly subordinate, clearly readable. All
  three of those lines were between 1.87:1 and 4.23:1 before.
- **Kepenk (kapalı).** The district line `Kadıköy` under the sign reads
  against the dark recess — it was 1.32:1. The handle's sub-label
  `yukarı kaydır` under `KEPENGİ KALDIR` reads too; it was 2.47:1 on the
  zinc plate and is now the plate's own secondary.
- **Kepenk (açık).** The clock, `19 Ağustos Çarşamba`, `KURTAR`, the four
  code characters, `1 × Fırından Sürpriz Paket`, `29 sn sonra kapanır`
  and `yanlışlıkla açtım` all read on the lit interior, and
  `Ödendi 69₺ · #K-MRPH` is unmistakably the money line.

### The gece regression

Same script, same seeded data, `GEZINTI_SATIN_ALMA=0` so neither run
spends stock. Pre-change build vs post-change build, ten frames:

**nine byte-identical; the tenth (teklif detayı) differs by 8 pixels out
of 1 316 640, max channel delta 3.**

For scale, the SAME post-change source built and walked twice differs by
753 px on Keşfet and 851 px on offer detail at delta 10 — the shutter
roll and the shop's light gradient land a frame apart between builds. The
change is an order of magnitude quieter than a no-op rebuild.

## Reproducing

```bash
# infra + an isolated database, so a parallel session's data is untouched
docker exec kurtar-dev-db-1 psql -U kurtar -d postgres -c 'CREATE DATABASE kurtar_td;'
docker exec kurtar-dev-db-1 psql -U kurtar -d kurtar_td -c 'CREATE EXTENSION postgis;'
# .env: DATABASE_URL=…/kurtar_td, KURTAR_API_PORT=4790,
#       CORS_ALLOWED_ORIGINS=http://localhost:8188
npm run migrate:deploy -w backend && npm run seed:demo -w backend
npm run start -w backend > /tmp/kurtar-backend-td.log 2>&1 &

cd apps/consumer && rm -rf dist
EXPO_PUBLIC_API_BASE_URL=http://localhost:4790 \
EXPO_PUBLIC_FAZ_ZORLA=alacakaranlik \
EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T16:45:00.000Z \
  npx expo export -p web --clear
grep -c '2026-08-19T16:45' dist/_expo/static/js/web/*.js   # prove what landed
npx serve dist -l 8188 -s &

cd ../../e2e
GEZINTI_URL=http://localhost:8188 GEZINTI_API=http://localhost:4790 \
DATABASE_URL=postgresql://kurtar:kurtar@localhost:4754/kurtar_td \
BACKEND_LOG=/tmp/kurtar-backend-td.log \
  node scripts/tam-gezinti.mjs /tmp/alaca alacakaranlik
```

## Traps hit, so the next pass does not

- **`expo export -p web` caches inlined `EXPO_PUBLIC_*` values.** Always
  `--clear`, and `grep -c` the value in the emitted bundle before
  trusting a frame. Already documented in `review-notes-tam-gezinti.md`;
  confirmed again here.
- **CORS is per-origin.** Serving a second build on a second port and
  forgetting to add it to `CORS_ALLOWED_ORIGINS` looks exactly like "the
  login button does nothing".
- **The redeem screen's open state cannot be photographed on a pinned
  future clock.** `kaldir()` stamps `Date.now()`, while `kalanSn` is
  measured against `ClockProvider`'s pinned instant; with the pin hours
  ahead of the wall clock the 30-second window is already over and the
  shutter slams shut in the same frame it opens. The open frame here was
  taken from a second build that pins only `FAZ_ZORLA` and lets the clock
  run, buying the one seeded offer whose window covers the real hour.
- **Headless Chromium reports a screen reader**, so the handle renders as
  `kepenk-kol-dugmesi` (a plain button) rather than
  `kepenk-kol-suruklenir`. A script that only knows how to drag will
  time out on a screen that is working correctly.
- **The mock payment provider never self-confirms** and
  `react-native-webview` has no web build, so the walk delivers the
  webhook the provider would have (`POST /api/webhooks/payment` with
  `x-webhook-secret`). Everything downstream is then the real flow.
- **`₺` looks like `Ł` at 9–13pt in the review surface.** Known false
  alarm; the font carries U+20BA. Third report now. Do not "fix" it.

## Found, not fixed

1. **21 files still on `@kurtar/ui-tokens`** — `Ara`, `Favoriler`, the
   auth trio, the tab bar, `store/rate/cancel` and twelve primitives.
   They call `usePalet()` zero times and are therefore wrong on every
   phase, not just this one: in the dusk frames the tab bar is a white
   slab and the Ara/Favoriler titles are near-invisible. A parallel wave
   owns these files and was told to write text-on-ground against
   `yaziAnaZemin` / `yaziSisZemin`; those names are exactly what shipped
   here. **They will also need `yaziAnaCukur` / `yaziSisCukur` for
   anything that lands on `bgDerin`, and `sodyumYaziZemin` for money on
   the street** — `sodyumYazi` on `bgAsfalt` is 1.83:1 at dusk.
2. **`cizgiKil` hairlines are 1.43:1 on the dusk street** (1.34 by day,
   1.47 at night). They are decoration, not a UI-component boundary, so
   1.4.11 does not bite — but the section rule down the discovery spine
   is doing real work at that contrast and is worth a look.
3. **Profil's `Çıkış yap` is the loudest thing on the page** and
   **SENİN SOKAĞIN renders ~40pt tall** — both already filed in
   `review-notes-tam-gezinti.md` §B, both still true in the dusk frames.
4. **`sodyumYazi` on `yuzeyYukselti` is 5.43:1 at dusk** — fine, but it
   is the tightest sodium pair left and worth remembering if that surface
   is ever lightened.
