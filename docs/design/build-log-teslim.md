# Build log — Phase 2, Track B: detay → satın alma → kepenk

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



Scope: `docs/design/consumer-app-spec.md` §4.3, §4.4, §4.5. Nothing else.
Phase 1's components and tokens are consumed, never edited — nothing under
`src/design/` or `src/components/kepenk/` is touched by this branch.

Branch `feat/consumer-teslim`, one commit on top of `e84fff5`.
Worktree: `/home/tarik/Projects/kurtar-worktrees/track-b-teslim`.

---

## 1. What was built

### New: `src/components/teslim/`

| File | What it is |
|---|---|
| `perde.ts` | The ritual's arithmetic, pure: the 140pt lift threshold, the locked shutter's resistance curve, the haptic schedule (count + timing), the pickup-window guards, the code split, the code's spoken form, and where "now" sits on the window rail. |
| `TamKepenk.tsx` | The full-bleed shutter. The same object as `<Kepenk/>` at the size of a shopfront and travelling the other way. One `<Pattern>`-filled rect, `translateY` only on a group clipped by the container's `overflow: hidden`, snapped to whole pixels, lip drawn as its own `<Rect>` over the clip edge. Carries a drawn padlock when bolted. |
| `KepenkKolu.tsx` | The handle, and its three ways in: the drag, the reduced-motion press-and-hold, and the plain button under a screen reader — plus the text button that appears after two failed drags and never leaves. |
| `CanliSaat.tsx` | The 56pt hard-ticking clock, the nabız sweep re-armed by the same 1Hz rail that drives the digits, and the 6°-per-second notch ring that replaces the sweep under reduced motion. |
| `Kod.tsx` | `KURTAR` + the four informative characters at 44pt / +6 tracking. |
| `TeslimSeli.tsx` | The handover flood: 400 in / 2200 hold / 350 out, `#FFC864 → #FFF1DC`, the frozen instant, the shop and the package. |
| `OnayEkrani.tsx` | §4.4's confirmation: the roll up, then the ticket sliding down over it. |
| `KapandiEkrani.tsx` | §4.4's failure: the slam, the flash, and a real alternative card. |
| `DetayBasligi.tsx` | §4.3's storefront header — 8pt awning, 128pt band, the sign at `tabela.xl`. |
| `AlisPenceresi.tsx` | The pickup window as a rail with "now" marked on it. |
| `DurumEkrani.tsx` | Loading / error / "not now" in the metaphor: a shutter that is simply down, or half down with a torn paper note taped across it at 2°. No shimmer, ever. |
| `ortak.tsx` | The shared chrome: the 56pt sodium CTA, section labels, the painted block, the sticky bar (the one sanctioned shadow), and the drawn icon buttons. |
| `ekran-okuyucu.ts` | `useEkranOkuyucu()` — subscribed, for the same reason `useReduceMotion()` is. |
| `tr-yer.ts` | Turkish locative for a place name, for §4.5's `Kadıköy'de 13. kepenk`. |
| `eslestir.ts` | `DiscoveryOfferItem` → the card's props. A projection; nothing is re-derived. |

### New: `src/lib/parlaklik.ts`

Brightness to 1.0 and auto-lock off while the redeem screen is mounted,
both restored on unmount, both app-scoped so neither needs a permission
prompt at a till. Adds `expo-brightness` and declares `expo-keep-awake`
(already present transitively).

### Screens rewritten

`app/offer/[id].tsx`, `app/purchase/[offerId].tsx`, `app/payment/[id].tsx`
(its confirmed branch is §4.4), `app/redeem/[id].tsx`.

### Removed

`components/SwipeToConfirm.tsx` and `components/LiveClock.tsx` — superseded
by `KepenkKolu` and `CanliSaat`. `accessibility-i18n.test.tsx`'s M22
guarantee (accessible strings come from i18n, proven by switching language)
moved onto the two replacements rather than being deleted with them.

### Behaviour carried across unchanged

- The atomic stock claim, and `OFFER_UNAVAILABLE` treated as a common
  outcome rather than an exception.
- The pre-contract gate: ÖBF/MSS links and an unchecked-by-default
  acknowledgement, still blocking `POST /reservations`.
- The server-stated pickup window and the two distinct rejection codes,
  pre-empted client-side and rendered verbatim when the server does refuse.
- The offline queue and its poll-only reconciliation.
- The merchant's own allergen text and the cancellation rule — both are
  legal requirements and neither is dropped for layout.

### Tests

469 total, all green (`437` before). New:

- `teslim-perde.test.ts` — 22 tests: the threshold commits at exactly
  140pt and not a point before it; the locked curve can never reach it at
  any drag distance; the haptic split is 9/3 by platform; the tick schedule
  decelerates, lands its last tick exactly when the sign lights, and is
  spaced evenly in DISTANCE along the very bezier the roll runs (asserted
  against `Easing.bezier(0.16,0.84,0.3,1)` itself, so the two cannot
  drift); the three window states and the ten-minute warning; the rail
  marker clamped at both ends; the code split and its character-by-character
  spelling; and the Turkish locative, including the `.toLowerCase()` I-trap
  and the possessive-construction districts.
- `teslim-kepenk-ekrani.test.tsx` — 10 tests over the real screen: the
  closed state has no code, no clock and no order MOUNTED; opening
  produces all three and lights the sign; `yanlışlıkla açtım` puts it back
  down with no redeem attempted and it re-opens; it closes itself after 30
  seconds and stays re-openable; a screen reader replaces the drag with a
  plain button that works; reduced motion swaps in the press-and-hold and
  the notch ring; the clock keeps ticking under reduced motion; the
  handover redeems and floods; the impact line comes off the server's
  ledger and is absent rather than invented when the ledger has nothing.
- `redeem-screen-window.test.tsx` — rewritten onto the new interaction,
  keeping every cross-lane assertion it carried.
- `test-utils/ekran.tsx` — one render helper that mounts a screen inside
  the three providers the real app mounts.

`tsc --noEmit` and `eslint --max-warnings=0` clean.

---

## 2. What I saw in the screenshots, and what changed because of it

Method: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8082 npx expo export -p
web`, then `e2e/scripts/expo-dist-serve.mjs` and
`e2e/scripts/teslim-shot.mjs` (both committed) at 390 × 844, DPR 3, against
the running backend. The script signs in over the real API, publishes a
real live-now offer as the seeded Moda Fırın merchant, reserves, settles
the payment through the mock webhook, drives the real screens, and deletes
every row it created.

Two things are stubbed and nothing else: the bearer token (the app cannot
hold a session in a browser — see §4.6), and one planted 409 to photograph
§4.4's failure without eating the shared seed's last bag.

**Two blockers before anything could be looked at.** The dev CORS allow-list
is a fixed four ports, so a review build on any other port is blocked
before it can fetch; the review server now proxies `/api` so the page and
the API share an origin. And the static export writes `dist/redeem/[id].html`,
which a plain file server 404s for `/redeem/<a real id>` — the same server
resolves the bracket file.

### Round 1 — the offer detail

1. **`PRODUCE` printed inside a Turkish sentence.** The store's
   `categoryTags` are API enum values and were rendered raw. Now spoken
   through `discover.categories.*`.
2. **`şimdi 11:08` ran off the left edge of the screen.** The label is
   pinned to the window marker, and the marker sits at ratio 0 for every
   window that has not opened — which is most of them, most of the day.
   Clamped to 8–92% of the rail.
3. **The stock chip repeated the CTA's own subtitle** — `son 5 paket kaldı`
   above `son 5`, in the same 80pt. The chip is gone; the number stays
   where the spec puts it.
4. **`Kepenk 1 saat 39 dakika sonra iniyor`** — that is the screen-reader
   phrasing. The visible line now uses the compact `1 sa 39 dk`.
5. **`Kadıköy, İstanbul, Kadıköy`** — the address already carries the
   district on every seeded row and I was appending it again.
6. **`HARİTADA GÖ…`** — two secondary buttons in the 15pt display face do
   not fit two-up at 390pt. Secondary actions now take the label face,
   which is what a quieter control should have been anyway.
7. **The last section sat under the sticky bar.** Bottom padding raised.

### Round 2 — the redeem screen

8. **The corrugation read as pinstripes.** 8pt is right for a 68pt gauge
   band and wrong across a whole shopfront; the full-bleed shutter takes a
   20pt slat. Still one `<Pattern>`-filled rect.
9. **The padlock was invisible** at 22pt in a 15%-alpha ivory. Now 40pt in
   the lip's own dark metal, which is what a bolt on zinc looks like.
10. **`yukarı kaydır` under a bolted shutter** is an instruction that does
    not work. Under lock the sublabel states the pickup window instead.
11. **The three guards were shouting.** §4.5 writes them in lower case
    (`18:30'da açılır`, `kepenk 8 dk sonra iniyor`) and they are not set in
    the display face; they no longer take caps.
12. **The lit sign was not visibly lit.** Open and closed differed only by
    text opacity and a border colour. Now a lamp comes on: a sodium bloom
    behind the plaque and light landing on the painted face, so the two
    states are unmistakable at a glance — which is the entire job of the
    first second at a counter.
13. **The sign was not the largest element.** It sat at 28pt under a 56pt
    clock, which is exactly what §4.5 says must not happen. On this one
    screen it is fitted to the plaque, up to 44pt (see §4.5 below for the
    residual tension with §1.2's scale).
14. **A third of the screen was empty below the button.** The open state
    now fills the opening top-down and the action is anchored at the
    bottom of the frame, which is the order a shop worker reads in.

### Round 3 — the purchase screen

15. **The stepper buttons and the consent checkbox were slate tiles on a
    cream plaque** — `bgDerin` is a pale slate in the day palette, and a
    filled box reads as a question already answered. Both are outlines on
    the surface they sit on now.
16. **The sold-out screen had no alternative** whenever location was
    denied, which on web is always — turning §4.4's "and here is the
    nearest one" into precisely the dead end it exists to prevent. It falls
    back to the shop's own district centre, which is where the customer was
    already walking.

### Round 4 — the error state

17. **The paper note was dark paper with pale ink** in daylight, because it
    took `plakaYazi`. Paper is an object and keeps its own colour in every
    phase, like the flood does.

### What the final frames show

`08-kepenk-kapali` is a shut shopfront under an unlit sign, with a handle
and a padlock and nothing else on it — screenshot it and you have a picture
of a closed shop, which is the structural anti-fraud property the design is
built on. `10-kepenk-acik` is the same shopfront with the lamp on: the name
at 44pt in a blooming plaque, a hard-ticking clock with the nabız under it,
`K U R T A R` over four speakable characters, the paid line carrying the
server's own total and the full code, the 30-second countdown, `TESLİM
ALDIM`, and `yanlışlıkla açtım` beneath it. `05-az-once-kapandi` is a
shutter that has just slammed with a live Yeldeğirmeni Pastanesi card
already under it.

---

## 3. Dependencies added

| Package | Why |
|---|---|
| `expo-brightness@~57.0.1` | §4.5: brightness ramps to 1.0 and is restored on unmount. App-scoped (`setBrightnessAsync`), never `setSystemBrightnessAsync`, which on Android needs WRITE_SETTINGS and would leave the device changed after the app closes. |
| `expo-keep-awake@~57.0.1` | §4.5: auto-lock disabled. Already present transitively via `expo`; now declared, because an undeclared transitive import is a dependency you do not control. |

Both are mocked in `jest.setup.ts` for the same reason every other native
module there is.

---

## 4. Where I could not follow the spec as written

### 4.1 The pickup code is `K-7F3M`, not `4 7 2 9`

The server mints a fixed `K-` prefix plus four characters from an alphabet
that deliberately excludes 0/O/1/I (`reservation-code.util.ts`) — which is
§4.5's "four speakable characters" already, just not numeric. Money and
codes are never re-derived on the client, so nothing is reformatted: the
prefix is the same on every code in the system and therefore carries no
information, so the four that matter take the 44pt type and the full
string stays on the ticket line below, where a staff member matching
against `K-7F3M` on their own tablet sees every character. The screen
reader is given the whole thing, character by character.

### 4.2 There is no 60-second undo of the handover

§4.5 has the server mark an order `gösterildi` at first open and `teslim`
at confirmation, with the undo reverting to `gösterildi`. This backend has
no such pair: `POST /reservations/:id/redeem` is a single guarded
transition to `REDEEMED` and there is no un-redeem. So `yanlışlıkla açtım`
undoes the thing that actually happened — the shutter going up — and it
costs nothing because no server call has been made at that point. The
handover itself is a deliberate press on a 56pt button at the bottom of
the frame, below the ticket. **Wiring a real undo needs a backend change**
(a `SHOWN` state and a revert endpoint) and is out of this track's scope.

### 4.3 The 30-second countdown is a number, not an emptying ring

The redundancy law requires the number and the number is there
(`29 sn sonra kapanır`). The ring is not drawn because the only ring on
this screen is the reduced-motion liveness notch ring, and two rings a
metre apart, one filling and one emptying, compete for the same glance.
The shutter coming back down is the shape.

### 4.4 §4.3's VİTRİN cannot list last week's contents

`geçen hafta çıkanlar`, the weight, the servings and the `DÜKKÂN NOTU` are
not in the API: `discovery.store()`'s `todaysOffers` carries title,
category, diet flags, prices and the mandatory allergen disclaimer, and
nothing else. The section renders what genuinely exists — the package name,
the shop's own categories and diet flags, and §4.3's one sentence about
why the box is a surprise — and the allergen text gets its own labelled
block, because it is a legal requirement and burying it in a prose
paragraph would be a regression. **Adding the rest is a backend change**
(a "recently included" projection on the bag template).

### 4.5 The shop name is the largest element, but the clock is bigger

§4.5's prose says the shop name is the largest element; §1.2's scale gives
`clock` 56pt and `tabela.xl` 28pt. Both cannot hold. The sign is fitted to
its plaque up to 44pt, which makes it the loudest object on the screen —
it is at the top, it is in the display face, it is on a lit plaque with a
bloom, and it is nearly twice the size the token alone would have given it
— while the clock keeps the 56pt the scale publishes, because a clock that
cannot be read across a counter stops being proof.

### 4.6 The consumer app cannot hold a session in a browser

`expo-secure-store`'s web module is an empty object, so
`getStoredRefreshToken()` cannot resolve on web and sign-in is a
device-only path. That is pre-existing and out of scope (and
`lib/secure-tokens.ts` is being edited on another branch). The screenshot
script therefore signs in over the real API and attaches the bearer to the
page's own requests. Everything else in those runs is real.

### 4.7 react-native-web always reports a screen reader

`AccessibilityInfo.isScreenReaderEnabled()` resolves `true` in
react-native-web — it cannot detect one, so it assumes the accessible
path. On web the redeem screen therefore always renders §4.5's plain-button
substitute rather than the drag. That is the substitution working, and web
is a review surface, but it means the DRAG ITSELF has not been exercised in
a browser; its threshold, its release behaviour and its rubber-band are
covered by `teslim-perde.test.ts` and the screen tests instead.

### 4.8 Small things

- **`⟳` is dropped from the countdown line.** U+27F3 is not in the three
  shipped families and would have rendered tofu next to a number that is
  the whole point of the line.
- **A denied location falls back to the shop's district centre** for the
  sold-out screen's "nearest alternative", using the district list
  `lib/location.ts` already maintains for exactly this reason.
- **The impact line is omitted, never invented.** `GET /me/impact`'s
  `count` arrives after the handover; if the ledger has not caught up the
  line is simply absent.
- **The detail screen's offer state moves on the 60-second bucket**, like
  every other clock-driven thing in the app, so an offer that opens at
  11:30 can read "not open yet" for up to 59 seconds. That is §1.3's
  "snaps on a 60-second tick; it never creeps" applied to state as well as
  to the gauge.
- **The confirmation's secondary action is `SİPARİŞİ GÖRÜNTÜLE`**, which
  §4.4 does not draw; the screen would otherwise have exactly one way out
  and it is reached by `router.replace`.

---

## 5. What could not be exercised without a device

- **The haptics.** The nine-versus-three split, the decelerating schedule
  and the `Medium` tick landing with the light are asserted as data in
  `teslim-perde.test.ts`, and the call sites are platform-guarded off web,
  but whether nine ticks in 700ms actually read as corrugations on a given
  iPhone's Taptic Engine — and whether three read as corrugations rather
  than as three taps on a mid-range Android's ERM motor — is a judgement
  that needs the two devices in hand. This is the single most important
  thing left to check, and §6's own build order says so.
- **Brightness and auto-lock.** `expo-brightness` has no web
  implementation and a simulator does not tell you whether 1.0 is enough
  in a bright bakery, or whether the restore is perceptible when backing
  out.
- **The drag.** See §4.7 — the browser gets the accessible substitute.
- **VoiceOver and TalkBack themselves.** The substitution, the composed
  live-region announcement and the digit-by-digit code are asserted in
  tests; how they actually SOUND, and whether the announcement lands
  before a shop worker looks at the screen, needs a real screen reader.
- **Dynamic type at 1.3× and 1.6×**, and the `deviceYearClass < 2019`
  degradation, both of which belong to Phase 3.

## 6. Known noise

- The exported web build logs two console errors on load, both pre-existing
  and unrelated: a React hydration warning from the static export, and
  `ExpoNotifications.getLastNotificationResponse is not available on web`.
- At DPR 3 only, headless Chromium's screenshot of the confirmation screen
  duplicates the last button's label at the top of the frame. It does not
  reproduce at DPR 1, does not appear in the DOM at either, and does not
  appear on any other screen — a screenshot-pipeline artifact of the web
  review build, not a rendering defect.

## 7. How to open the screens

```bash
cd apps/consumer
EXPO_PUBLIC_API_BASE_URL=http://localhost:8082 npx expo export -p web --clear
cd ../e2e
node scripts/expo-dist-serve.mjs ../apps/consumer/dist 8082 http://localhost:4750 &
node scripts/teslim-shot.mjs /tmp/teslim      # 11 frames, cleans up after itself
```

Set `TESLIM_KEEP=1` to leave the offer and reservation in place and browse
them by hand; `TESLIM_DSF=1` for un-retina frames.

---

# Second pass — the opened shop, and the night nobody had looked at

`docs/design/review-notes-teslim.md` sent two things back. Everything it
lists as verified good is untouched: the closed redeem state still
photographs as a shut shutter with no code on it, the open state is still
ordered by the staff member's task, the clock still ticks and the sign is
still the largest object.

Nothing under `src/design/` or `src/components/kepenk/` is edited — not
one token, not one Phase 1 component.

## 8. The opened shop was a void

**Before.** On both frames where the shutter goes up, the area it vacated
was the app's ground with the metal subtracted from it: `bg.derin`, flat,
edge to edge. `<TamKepenk/>` did carry light, and during the roll it is
good — sodium knifing out from under the rising lip — but its opacity ran
to **zero at the end of the travel**, on the reasoning that the light must
never compete with the code. So the payoff of the app's only two upward
rolls was a grey rectangle, arrived at smoothly. The confirmation was
worse than the review could see from one frame: its sign never lit at all
(§4.4 says "then the LIT tabela settles"), so the screen had no light on
it anywhere except the CTA's own fill.

**Now.** The metal comes off a **room**. `<AcikDukkan/>` is the offer
card's light fix at the size of a shopfront — the same idea the card got
in `build-log-foundation.md` §6.1, applied to a whole screen — and the
travelling light now hands over to it instead of going out:

1. **the lintel and the depth** — brightest immediately inside the
   opening, where the lamp hangs, falling away to an **ambient floor**
   rather than to zero, because the back of a lit shop is dim and not
   black;
2. **the lamp** — a radial bloom with a source and an edge, so the room
   has a direction of light rather than a flat wash;
3. **the counter** — light pooling over the bottom third, which is where
   the paperwork and the action sit;
4. **the sill** it stands on, taking the light's own core (`isikCekirdek`)
   rather than a wash of it. Without a sill a wide-open shop is a
   featureless warm rectangle.

**The ground stays the screen's own, and the light does all of it.** The
card needs a `vitrinZemin` because its interior is visible with the lamp
OFF — not open yet, sold out. Neither state exists on these two screens:
here the interior is only ever seen through a shutter that is going up,
which is to say only ever lit. The sold-out screen proves the rule from
the other side — `KapandiEkrani` passes `isikVar={false}` and gets no
room at all, because nothing opened.

**The numbers are data, not styles.** `dukkan-isigi.ts` holds the falloff,
the lamp, the counter and the sill the way `perde.ts` holds the ritual and
`olcum.ts` holds the gauge, and `<AcikDukkan/>` paints them and nothing
else.

### The constraint the card never had: this interior carries type

The card's band has no words in it, so its light could be spent freely.
This room carries the clock, the code, the ticket and the undo. Composited
over the night ground, sodium past ~0.26 alpha drops `text.sis` under
4.5:1 — so the profile is shaped around the type rather than around taste:
a hot lintel band in the top 2% of the opening, where nothing is ever
written, then everything below it inside the budget, then the counter
rising again under an opaque CTA.

That budget is a test, not a habit. `teslim-acik-dukkan.test.ts` composites
the light over each phase's own ground and asserts the light never takes a
pair below a floor the bare ground was meeting, at eight depths, in all
three phases. It also asserts the room is never unlit (every depth is
above zero alpha), that it has a direction (the lintel is warmer than the
depth), and that every fade ends at `rgba(R,G,B,0)` rather than
`'transparent'` (§5.7). 71 new tests; 540 green in total, from 469.

### The sign is one object now

The redeem screen's lit sign was a private function inside the screen
file. It is `<HeroTabela/>`, used by both upward rolls, so the
confirmation lights the same way the redeem does: a lamp behind the
plaque, light landing on the painted face, the name fitted to the plaque
up to 44pt. Its bloom now falls off on **both** sides — against a dark
ground a one-sided bloom is invisible, but against a lit interior its hard
top edge showed as a seam across the whole frame.

## 9. Then the dead space, re-judged

The review asked for this to be re-judged after the light, and it needed
less than it looked like.

**The redeem screen** had ~260pt between `29 sn sonra kapanır` and the
button. The slack moved rather than shrank: it is now **between the code
and the ticket**, so the two dense groups sit where the light is — the
code held up in the lamp, the ticket and the button down on the counter —
and the gap between them is the depth of the room. The divider that
separates them lands where the counter's light starts, so it reads as the
counter's front edge rather than as a rule.

**The confirmation** had ~40% of the frame empty above a vertically
centred sign. The sign is above the opening on every other surface in this
app — the card, the detail header, the redeem screen — so centring it put
the shop's own architecture upside down. It is now at the top, in the
brightest part of the room, with the ticket under it and the action on the
counter. Nothing was added to fill anything.

## 10. What the night palette showed that the day palette had hidden

The first pass shot all eleven frames at 11:35, so these screens had only
ever been seen in **gündüz**. `teslim-shot.mjs` now shoots every frame
once per phase into its own folder, moving the page's `Date` by a constant
offset (native timers untouched, so the roll, the flood and the 1Hz tick
all run at real speed), and the published offer's window runs to the end
of the Istanbul day so the shutter is openable at 21:30 as well as 12:30.

- **Night is where the defect actually bit.** In daylight the flat ground
  is a pale slate that reads as "a screen"; at night it is `#0E141A`, and
  an unlit rectangle at that value reads as a hole. The same fix is worth
  far more in the phase the product actually lives in — which is exactly
  why it had to be looked at there.
- **`isikSiddeti` cuts the daylight room to 62%,** and against a light
  ground a warm wash barely moves the luminance at all. The daylight
  interior is therefore a warm cast at the lintel and on the counter
  rather than a glow — honest for a lamp at noon, and the reason the sill
  is drawn as a *line* in the light's core: a line reads at any luminance.
  Contrast cannot measure this, so the test measures **warmth** (red minus
  blue) instead.
- **A pre-existing palette hole, found by measuring:** `text.sis` on
  `bg.derin` is **3.9:1 in gündüz and 1.9:1 in alacakaranlık**, unlit,
  before this branch touches anything. `bg.derin` is the redeem ground and
  §1.1 never measures type against it. So in twilight the date, the
  countdown and `yanlışlıkla açtım` are effectively invisible on that
  screen and always have been. The new light is held to "never the reason
  a floor is missed", and the hole itself is pinned by a test that lists
  exactly which pairs fail unlit, so fixing it is a visible change.
  **Fixing it needs a token or a surface change and is not this branch's
  to make.**

### Verification note

The review server from the first pass was still holding port 8082 and
serving the OLD worktree's `dist`, so the first round of "after" frames
was a photograph of somebody else's build with none of these changes in
it. Caught by querying the DOM for the new element rather than trusting
the picture. The export's `EXPO_PUBLIC_API_BASE_URL`, the server's port
and `TESLIM_APP` are one number and now say so in the script's header.

## 11. Still open

- **The haptics, the drag, the brightness and the screen readers** — all
  still device-only, exactly as §5 of the first pass says.
- **`text.sis` on `bg.derin` in gündüz and alacakaranlık** (above). A
  palette question, reported rather than patched.
- **The confirmation's roll is hard to photograph**: the shutter starts
  rolling as soon as the payment resolves, so a frame at 1.7s is already
  past it. `06-satin-alma-onayi-roll` is currently a duplicate of `07`.
  The redeem's roll (`09`) does catch mid-travel and shows the handover.
- **`lib/secure-tokens.ts` and `lib/auth-context.tsx` are modified in the
  working tree and are NOT part of this commit** — they are another
  branch's web-session work, left where they were found.
