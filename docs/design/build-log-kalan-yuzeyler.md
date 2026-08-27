# Build log — the surfaces that belonged to no track

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
> so the same frame can be reproduced on demand rather than archived.
>
> **Re-seed first, and pin the clock to the day you seeded.** The demo
> bags are day-scoped: `npm run seed:demo -w backend` writes them onto
> *today's* Istanbul date, so a week-old seed leaves discovery genuinely
> empty and the walk stops at the first tap with a locator timeout. The
> pinned instant in these notes (`2026-08-19T17:35:00.000Z`) is 20:35 on
> the day THIS review ran; use your own seeded date with the same
> 17:35 UTC / 20:35 Istanbul time, which is inside the 19:00–21:00 pickup
> window every seeded bag uses. I found this by re-running the walk eight
> days later and watching it fail — a reproduce instruction nobody has
> re-run is a claim, not an instruction.
>
> See `docs/consumer-on-a-phone.md` for the traps that make a rebuild
> photograph something other than what you think.



Branch `feat/kalan-yuzeyler`. Subject: the ~21 files that were never
anyone's redesign track and still imported `colors` from
`@kurtar/ui-tokens`, called `usePalet()` zero times, and — since `Screen`
started painting the phase's ground (`798aa4a`) — rendered dark ink on a
near-black street.

Reference: `docs/design/consumer-app-spec.md` and
`docs/design/review-notes-tam-gezinti.md` §A.

---

## What the frames showed BEFORE (the reviewer's own, `/tmp/gece2`)

`05-arama-gece.png`: "Ara" invisible. `Paket, mağaza ara…` printed twice —
once as the field's label above it and once as its placeholder inside it.
The field pure white. Five white pill chips (`Yemek · Fırın · Market ·
Manav · Diğer`). "Ne aramak istersin?" invisible. A white slab across the
bottom. That single frame contains every defect §A names.

---

## Converted

**Primitives** — `Button`, `TextField`, `Badge`, `IconButton`,
`StarRating`, `EmptyState`, `LoadingState`, `ErrorState`,
`DistrictPicker`.

**Screens** — `(auth)/phone`, `(auth)/otp`, `(auth)/permissions`,
`(tabs)/_layout` (the tab bar), `(tabs)/search`, `(tabs)/favorites`,
`store/[id]`, `rate/[id]`, `cancel/[id]`.

**New** — `components/Cephe.tsx` (a shopfront that measures itself) and
`components/GirisCephesi.tsx` (kurtar's own shopfront, over the auth
trio).

## Deleted as dead

- **`OfferCard`** — reachable, but only from Ara, and it was the old
  design entire: a fetched `coverImageUrl` with a 🥡 emoji tile behind it
  (§5.15 forbids photography outright) and a **struck-through original
  price** (§5.8 forbids the fabricated "was" price by name). Ara now
  renders `VitrinKarti`, the card the street already uses, so the file had
  no consumer left.
- **`FilterSheet`** — zero consumers before I touched anything: Ara
  imported only its `CategoryFilter` *type*. Discovery's own comment
  ("`FilterSheet` is untouched and still serves Search") was mistaken. It
  also encodes the replaced design — a diet/radius/pickup-time sheet the
  finished spec's Keşfet does not have.
- **`Chip`** — its only two consumers were Ara and `FilterSheet`. With Ara
  on `CiplerBar` and `FilterSheet` gone, nothing rendered it.

---

## The judgement calls

### The text field — a slot cut into the shopfront

A white input is wrong in every phase, and so is a white input tinted
dark: the question is what a text field *is* on this street. It is a
**recessed panel in a shopfront**. §1.1 already assigns `surface.kaldirim`
to input fields, so the field takes the card surface and wears the same
painted chassis every object in this app wears instead of a shadow — a 1pt
top hairline where light lands on the upper edge, a 1pt contact edge
underneath, `r.card`, `elevation: 0`. By day it is the sign ivory; at
night it is the lit card face. In neither is it white.

Two states, both **discrete** rather than animated (§1.3/§5.10):

- **Focus** swaps the border to `sodyumYazi`, not `sodyumDolgu`. #FFB23F
  on the day's ivory is **1.45:1** — it would vanish exactly when a user
  needs to see which field has the caret. `sodyumYazi` measures 8.83 /
  4.82 / 5.55 across night, dusk and day.
- **Error** is the app's alarm object, not red type. Red as loose type
  cannot survive the phase inversion at all: `tenteYazi` is 4.38:1 on the
  night card and 4.26:1 on the day ground, and the one surface it is legal
  on (`tenteYaziZemini`) *moves between phases*, which no fixed layout can
  follow. So the message lands on an **awning-red fill with `#12181F`
  ink** — §1.1's own rule — and the field's border turns red with it. Two
  places, one fact: the redundancy law.

The duplicated label is fixed by a new `etiketGizli` prop: the label is
still the field's accessible name, it is simply not drawn, so the
placeholder is the only visible instance of the string. Ara and both auth
fields use it.

### The chips — the discovery row, not a copy of it

"Reuse that, don't invent a second one" is why Ara now renders
**`CiplerBar` itself**, with `kategoriSorgusu`/`eslesiyorMu` doing the
query mapping exactly as the street does. Making `Chip` merely *look* like
the discovery chip would have been inventing a second one.

This also closes a real product seam: Ara named the API's five raw
`BagCategory` values (Yemek · Fırın · Market · Manav · Diğer) while Keşfet
named the spec's six (TÜMÜ · FIRIN · PASTANE · MANAV · KAFE · MUTFAK), so
"Fırın" on two adjacent tabs meant two different sets. One set now.

### The tab bar — a shelf, not an announcement

§1.1 assigns `surface.yukselti` to the tab bar by name, alongside the
bottom sheets and the sticky CTA bar. It takes that, plus the painted
contact edge (`bg.derin`, the darkest value in every phase) instead of a
shadow. The lit tab is `sodyumYazi` — the phase's *legible* sodium, since
#FFB23F on the day's ivory shelf is 1.45:1 — and the unlit ones are the
mist ink. One tab is on and the rest are shut: the same sentence the rest
of the app speaks. `sceneStyle` carries `bgAsfalt` so a tab swap never
flashes a white frame between two dark screens.

Measured: lit tab 7.77 / 5.43 / 5.95, unlit tab 6.17 / 5.73 / 6.28.

### The auth trio — the app it opens

This is the first thing a user ever sees and it had no relationship to the
product: a coloured wordmark over two form rows. It now opens with
`Cephe` — the app's own object at the size of a shopfront you have stopped
in front of: the awning (kurtar's own kırmızı/beyaz, the first of the six
real combinations every shop is hashed onto), the corrugated shutter with
sodium knifing out under the lip, the oven glyph inside the lit vitrin,
and the painted sign with its two mounting bolts reading **KURTAR**. A
user who has seen this screen recognises the offer card the moment
discovery loads, because it is the same thing.

**The shutter does not move.** §2 spends the upward roll in exactly two
places — purchase confirmation and the redeem swipe — and that inversion
is the emotional arc of the whole product. Spending it on a login screen
would spend it before the user has done anything, so the facade renders at
rest (`girisYap={false}`, p = 0.42).

The OTP field is set in Chivo Mono at +8 tracking, echoing the four digits
the merchant reads off the redeem screen: those two screens are the only
places in the app where digits are the entire content.

### Empty states — somewhere to go

`EmptyState` keeps its CTA slot and the callers that have somewhere to
send the user now fill it: Favoriler → "Dükkânlara göz at", a fruitless
Ara → "Yakındaki paketlere bak", and the three dead ends on
`rate`/`cancel` (already rated, not eligible, reservation not found) get a
way back rather than a full stop.

It deliberately does **not** draw the closed-shutter picture. That belongs
to the street (`kesif/BosSokak`, `teslim/DurumEkrani`), where "nothing is
open" is the actual fact. Here the fact is usually about the user — no
favourites yet, nothing typed — and a shuttered shopfront over it would
say something untrue.

### The shop page — identity, not a photograph

`store/[id]` opened with a fetched 160pt cover image and a 🏬 tile behind
it. The hero is now the shop's own identity: its hashed awning and its
painted sign, the same two objects that name it on the street, in
Siparişler and in Favoriler.

**No shutter here.** The kepenk is a clock for *one* offer's closing time
(§2); a shop is not an offer, and a gauge over a shop would be a number
with nothing behind it. The rows below carry each offer's own window and
its own `ZamanHapi`.

The sign is lit when the shop has anything on sale today and dark when it
has nothing left. First pass tied it to "open *this minute*", which made
every shop page dark before 19:00 — and `plakaYaziSonuk` is ivory at 22%,
so the one thing a shop page must always say clearly was the thing it said
least. Caught on the 12:30 frame.

### Favoriler — the awning stripe

The avatar was a cover photo with a 🏬 emoji fallback. It is now the
shop's own 4pt hashed awning strip down the row's left edge — the same
strip, from the same hash, that §4.6 gives the orders list — so the list
is scannable by colour rather than by a logo nobody uploaded. The status
badge moved from beside the name to under it: "Bugün paketi var" is four
words and squeezed into the right-hand column it took the shop's own name
down to an ellipsis (seen on the first night frame).

### Badge

Tones are now `sodyum` (the shop's lamp is on) / `tente` (an alarm, again
a fill with dark ink) / `notr` (a hairline pill). The old `success` tone
was the app's only green pixel.

---

## Tokens

Written against the contract for `yaziAnaZemin` / `yaziSisZemin`: the ink
for type on the STREET GROUND (`bgAsfalt`, `bgDerin`), with
`yaziAna`/`yaziSis` staying the ink for type on CARD/PANEL surfaces.

**These are PLACEHOLDERS added here only because `tsc` cannot compile
against tokens that do not exist yet.** The other branch's real values
must win on merge.

| phase | `yaziAnaZemin` | `yaziSisZemin` |
|---|---|---|
| gece | `#F2E6CE` (= `yaziAna`) | `#9FB0AC` (= `yaziSis`) |
| gunduz | `#12181F` | `#4B5A58` |
| alacakaranlik | `#12181F` | `#12181F` |

Night is byte-identical to the existing inks, so nothing changes at night.
Twilight **collapses both roles onto the primary ink**, because `#4B5A58`
measures **1.93:1** on `#7A868C` and that palette currently has no second
ground ink at all — which is precisely the dusk defect the other branch is
fixing. Do not read the twilight row as a design decision.

`design-contrast.test.ts` is extended with the pairs this work
introduces — both ground inks against `bgAsfalt` in every phase, the two
tab-bar states, the field's ink and placeholder, the focused and erroring
borders as ≥3:1 graphics, the alarm strip, and the demonstration that the
card ink genuinely fails on the ground. The floor holds the contract, so
the other branch's real values have to satisfy it too.

---

## Verification

`npx tsc --noEmit`, `npx expo lint --max-warnings=0`, `npx jest` — clean;
46 suites, 700 tests. New: `src/__tests__/kalan-yuzeyler.test.tsx` (10
tests) and the contrast additions.

Two builds, both with `--clear`, both with the inlined value proved by
grep before serving:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8101 \
EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T17:35:00.000Z \
EXPO_PUBLIC_FAZ_ZORLA=gece  npx expo export -p web --clear --output-dir dist-gece
# grep -o 'localhost:810[0-9]' dist-gece/…/*.js | sort -u  ->  localhost:8101

…T09:30:00.000Z, FAZ_ZORLA=gunduz, :8102 -> dist-gunduz   (localhost:8102)
```

served with `e2e/scripts/expo-dist-serve.mjs`, walked with
`e2e/scripts/tam-gezinti.mjs` and a new
`e2e/scripts/kalan-yuzeyler-shot.mjs` for the four surfaces the walk never
reaches (OTP, the shop page, the rating form, the cancel sheet), all
reached by clicking or by a client-side history push — never a
`page.goto()`, which drops the in-memory session.

### What the frames show

**Ara, 20:35.** "Ara" sets in ivory on the asphalt. The search field is a
recessed slate slot with a 1pt light edge along its top, and the
placeholder `Paket, mağaza ara…` is legible inside it — printed once, not
twice. TÜMÜ is a sodium pill with dark ink; FIRIN, PASTANE, MANAV are
hairline outlines. "Ne aramak istersin?" reads in ivory with its body in
mist. The bottom of the screen is a dark shelf, not a white slab.

**Ara, 12:30.** The ground is the cool pale slate, the field is the sign
ivory recessed into it, the placeholder is legible, TÜMÜ is still the
sodium pill, and the tab bar is an ivory shelf with "Ara" in dark amber.

**Favoriler, 20:35 (empty).** Title and "Henüz favorin yok" both in ivory,
the body in mist, and an outlined "Dükkânlara göz at" under it.

**Favoriler, both phases (one row).** The row wears Yeldeğirmeni
Pastanesi's yellow-and-navy awning down its left edge; the full name fits
on one line; "Bugün paketi var" sits under the meta as a sodium pill with
dark ink.

**Telefon, 20:35.** A red-and-white awning, corrugated zinc half down,
sodium blazing out of the gap with the oven glyph silhouetted in it, and
KURTAR lit on its plaque with the two bolts. Below: the title in ivory,
the subtitle in mist, the recessed field, the sodium CTA.

**Telefon, 12:30.** The same object inverted — the shutter reads as a dark
shape against a bright street, the interior light is a muted warm wash,
and KURTAR is near-black on the ivory plaque.

**Kodu gir, both phases.** Six digits in Chivo Mono at +8 tracking,
centred; a wrong code turns the field's border awning red and puts "Kod
hatalı ya da süresi doldu." on a red strip in `#12181F` ink beneath it.

**İzinler, both phases.** Two pavement blocks on the card surface with the
painted top hairline, ivory/near-black titles, mist bodies, outlined "İzin
ver", and one sodium "Devam et".

**Dükkân, 20:35.** The sarı/lacivert awning, YELDEĞİRMENİ PASTANESİ lit
with the sodium bloom, address and rating on the ground, then one compact
row: `149₺` in sodium, `280–380₺ değerinde` in mist (no strike-through),
and a red `SON 25 DK` pill.

**Dükkân, 12:30.** The same, name at full strength, the row's pill reading
`19:00'da açılıyor` on its dark plate.

**Değerlendir, both phases.** Three lit stars in sodium / dark amber and
two unlit in mist; the comment box is the same recessed slot as every
other field, with the placeholder legible; sodium "Gönder" and a quiet
"Şimdi değil".

**İptal, both phases.** The passed deadline reads as an awning-red strip
with dark ink — the alarm object — over an outlined "Vazgeç".

**Not regressed:** discovery, the map, orders, the profile street and the
offer detail all render as the review left them; only the tab bar beneath
them changed.

---

## Found, not fixed

1. **The tab bar's labels clip their descenders on the web export.** "Keşfet"
   reads "Kesfet" and "Siparişler" reads "Siparisler". **This is
   pre-existing** — the reviewer's own `/tmp/gece2/05-arama-gece.png`
   clips identically, with the old white bar and the default system face —
   and it is a web artifact: the bar sits flush to the window bottom and
   its label line box overflows. I tried three fixes (an explicit height +
   bottom inset, explicit paddings, a label margin); each moved the label
   further down rather than growing the bar, so I reverted to overriding
   the font alone and left the bar's own metrics to React Navigation. It
   needs someone who can measure it on a device.
2. **`StatusBar style="dark"` is hardcoded in `app/_layout.tsx`.** At
   night the status bar should be light. The fix means moving `StatusBar`
   inside `ThemeProvider`, which is a root-layout change another agent is
   likely to touch; left alone deliberately.
3. **The shop page prints its address twice.** `Kadıköy, İstanbul,
   Kadıköy` — `store.address` already ends in the district. Pre-existing
   (`${address}, ${district}` is unchanged from the old screen) and a copy
   question rather than a design one.
4. **Three near-duplicate primitive families now coexist**: `Button` /
   `PanelButton` / `teslim`'s `Dugme`, and `Badge` / `PanelPill`, and
   `EmptyState` / `PanelEmptyState`. Each is scoped to a track, and each
   now speaks the same language, so nothing looks wrong — but they should
   be collapsed to one set. I did not do it here because `panel/` and
   `teslim/` are other tracks' vocabulary and rewriting ~15 call sites
   across them would collide with work in flight.
5. **Two icon systems.** Track B draws its icons as SVG paths
   (`teslim/ortak`'s `IKON`, "this app ships three families and none of
   them is an icon set"); Track C and these screens use Ionicons. The shop
   header and the offer detail header therefore draw the same back arrow
   two different ways. Unifying it is a bigger call than this task.
6. **`auth.permissions.skip` is an unused key** in both locales.
