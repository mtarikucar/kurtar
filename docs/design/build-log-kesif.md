# Build log — Keşfet discovery + Harita map (review round)

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



`feat(consumer): rebuild Keşfet discovery and add the Harita map tab`
committed this file's path in its message before the file existed — an
oversight in that session, not a deleted document. This is that account,
covering both the original build's two accepted deviations (never written
down until now) and the review round in `docs/design/review-notes-kesif.md`.

---

## 0. Two accepted deviations, carried over from the original build

Recorded here because the review explicitly asked for it — so the next
person does not "fix" either one:

- **Sections are grouped by `store.district`, not by neighbourhood.** The
  spec's mock shows "YELDEĞİRMENİ" / "BEŞİKTAŞ · vapurla 20 dk" section
  headers, but the API's `DiscoveryOfferItem.store` only carries a
  district field (`Kadıköy`, `Beşiktaş`), not a neighbourhood. District is
  the shape the mock is illustrating — grouped sections down a street
  spine — not a literal field name to chase.
- **No ferry-time estimate.** "vapurla 20 dk" in the mock is illustrative
  copy, not a transit-mode API this app has. Fabricating one would be
  exactly the kind of invented number §3 already refuses for the struck
  price. The meta rail prints real walking distance/time only, and drops
  the walking figure past 2.5 km rather than inventing a mode.

---

## 1. The spine contradicts itself (review fix #1) — resolved

**Before.** `sokakListesi()` grouped offers by district (a real, visible
tier — the section header, "verified good" in review), then sorted every
offer inside a district by closing time alone. A district can span
kilometres, so that inner sort had zero regard for distance — confirmed
against the live seeded backend, not just the static mock: Kadıköy holds
Yeldeğirmeni Pastanesi at 399 m and Moda Fırın at 1277 m, both closing at
the same minute, and the closing-time sort could print them in either
order — the exact reversal the review caught (`1,3 km` then `399 m`).

**The collision.** §4.1 wants two things about the same list at once:
"scrolling down is walking away from where you stand" (the spine), and
"closing time ascending within distance tiers, not by price" (the sort).
Read literally, "distance tiers" and "district" are not the same object —
a tier is a distance band; a district is an administrative area that can
contain several. Two ways to make both true:

- **(A) Make the tiers real** — bucket every offer into its own distance
  band (independent of district), sort bands ascending, and let closing
  time only break ties inside one band. The spine keeps its meaning; the
  scarce-resource rule keeps its job, just narrowed to "among offers this
  close together".
- **(B) The spine stops carrying distance** — drop the promise that
  scrolling is walking away, and let the spine be a plain per-card
  distance readout with no ordering claim.

**Chosen: (A).** (B) throws away the one part of this screen the spec
built specifically "for someone deciding while walking" — the thing the
review's own "verified good" list praised the spine for having. (A) costs
one extra sort key and changes nothing visible about the district
sections, which the review already signed off on. Districts stay the
outer grouping (§0's accepted deviation, untouched); within a district,
offers now sort by a **500 m band** (`MESAFE_KADEME_M`, `lib/kesif.ts`)
ascending first, closing time ascending second. 500 m is about six
minutes on foot (`YURUME_HIZI_M_DK = 80`) — short enough that two offers
in the same band genuinely read as "about as far", so letting time govern
inside a band doesn't undercut the walking metaphor the way it did across
an 878 m gap.

**After**, on the same real data: Yeldeğirmeni (399 m, band 0) always
sorts before Moda Fırın (1277 m, band 2), regardless of which one closes
sooner — verified against the live backend in the night screenshot (see
§4) and in `kesif.test.ts`'s new "distance ascends BETWEEN tiers even
when the farther offer closes sooner" test, which reproduces the exact
reviewed defect and asserts it no longer happens.

---

## 2. Real content was being clipped (review fix #2) — resolved

**Before.** `kartGenisligiHesapla()` took the ENTIRE spine footprint
(label + two gaps + hairline = 67pt) out of the card, on top of two full
16pt screen gutters: `390 − 16 − 67 − 16 = 291`. `VitrinKarti` is a locked
Phase 1 component — its own 12pt-per-side content padding isn't this
track's to touch — so the true minimum content width had to be measured
against the REAL rows, not guessed:

- Yeldeğirmeni's price row (`149₺` + `×2,2 değer` + `280–380₺
  değerinde`, tracked per §1.2's `data`/`micro` letter-spacing) needs
  **≈273.6pt** of content width → card ≥ **297.6pt**.
- Moda Fırın's meta row (`18:30–21:00 · 1,2 km · 16 dk` + a `son 6` stock
  chip) needs **≈276.8pt** → card ≥ **300.8pt**.

291pt was short of both by 6–10pt — small enough to look fine in a
sketch, large enough to visibly ellipsis real Chivo Mono text, which is
exactly what the review's screenshot caught.

**Where the budget came from.** §4.1's own comment already ruled out
shrinking the label (`54pt` is sized to the millimetre for the real
double-digit-km case, `"10,3 km"` — 53.2pt of glyph advance at 12pt
tracked `data`, an 0.8pt margin already). So the fix does NOT touch the
label. It comes from two places instead, both outside `VitrinKarti`:

1. **The spine's own gaps** tightened from 6pt to 3pt each
   (`SPINE_BOSLUK`).
2. **The list's own left inset** — previously a full second 16pt gutter
   stacked in front of the spine — drops to 0 (`KESIF_SOL_KENAR`). The
   hairline and its label now read as the street's own left edge, the way
   a rail sits flush in a lot of list UIs, rather than a gutter the spine
   sits inside. The **right** gutter is untouched at `s4` (16pt,
   `KESIF_SAG_KENAR`) so the list's right edge still lines up with the
   header and the filter chips above it — the asymmetry is confined to
   the one side the spine actually occupies.

`kartGenisligiHesapla(390)` now returns **313pt** (`290 − 0 − 61 − 16`,
where the spine total is `54 + 3 + 1 + 3 = 61`) — 12–16pt of headroom over
both measured minimums, verified by rendering the real data: no `…` on
`280–380₺ değerinde`, on `399 m · 5 dk`, or on `18:30–21:00 · 1,3 km · 16
dk` in either palette (see the screenshots referenced in §4).

`duzen.test.ts` pins `SPINE_ETIKET_GENISLIGI` at 54 (a regression guard
against "shrink the label" being tried again) and asserts the computed
width clears 291.

---

## 3. Loading and loaded were different layouts (review fix #3) — resolved

**Before.** `SokakYukleniyor` rendered each `KapaliKart` centred
(`alignItems: "center"`) inside its own `paddingHorizontal: s4` block,
with no spine at all. The loaded `FlatList` rendered each card inside
`SokakSatiri` — a spine column, then the card, at a completely different
x-position (and, before fix #2, a different width too). The instant real
data landed, the whole column visibly jumped — precisely the "loading is
a lie about layout" `§4.8` was written to rule out.

**Fix.** `SokakSatiri` now accepts `mesafeM: number | null`. `null`
renders the exact same column — same width, same hairline — with the
label replaced by an equal-width blank `View` instead of text: the
geometry is identical, only the number (real data this frame doesn't
have yet) is withheld. `SokakYukleniyor` wraps each `KapaliKart` in
`<SokakSatiri mesafeM={null}>` and switches its own outer padding from a
symmetric `s4` to the same `KESIF_SOL_KENAR` / `KESIF_SAG_KENAR` the
loaded `FlatList`'s `contentContainerStyle` uses — both values imported
from the same `duzen.ts` constants, so they cannot drift apart silently.

**Verified two ways:**
- Visually — the closed-shutter placeholders and the loaded cards sit at
  the identical x-position in both palettes (see the loading/list
  screenshot pairs in §4; the only thing that changes when data lands is
  the shutter height and the tabela text, never the card's position).
- In `sokak-satiri-geometry.test.tsx` (new) — four tests render
  `SokakYukleniyor` and a loaded `SokakSatiri` row independently and walk
  the RNTL JSON tree for every declared `width`/`paddingLeft`/
  `paddingRight`, asserting the loading tree and the loaded tree declare
  the exact same spine-column width, the exact same card width, and the
  exact same list inset — a real regression guard, not a
  re-statement of the constants.

---

## 4. Verification — day vs night, and what only gece revealed

Reused the previous session's documented recipe verbatim (throwaway
`EXPO_PUBLIC_KESIF_SCREENSHOT_BYPASS` gate in `src/app/index.tsx` and
`(tabs)/_layout.tsx`, reverted before every commit — never shipped) and
its `e2e/scripts/kesif-shot.mjs`, extended rather than replaced:

**Every frame the previous session captured was at 11:30 — whatever the
wall clock happened to be when someone ran the script.** That is why gece
had never been seen: nobody had ever run it after sunset. Fixed
structurally, not by remembering to run it at night: the script now fakes
the BROWSER's clock via Playwright's `page.clock.setFixedTime()` to two
fixed instants on the seeded offers' own calendar day —
`GUNDUZ_ZAMAN` (12:30 Istanbul, safely `gündüz`, before the seeded
16:00–18:00 UTC pickup window opens) and `GECE_ZAMAN` (20:35 Istanbul,
safely past the 25-minute post-sunset `gece` threshold, and still inside
that window with ~25 minutes left — the shutter/light gauge at its most
urgent, in the palette nobody had looked at). Faking only `Date.now()`
leaves every other timer (React, fetch, the app's own 60s clock bucket)
running normally, and the offers' `pickupStartAt`/`pickupEndAt` are real
fixed instants from the live backend, so the gauge math in the
screenshots is genuine, not simulated. The run is now reproducible
regardless of when it's launched, which the 11:30-only original wasn't.
Also added: a network-mocked, unfiltered, zero-item empty state (`route
.fulfill`) so the REAL `§4.8` day/night empty copy (`"Henüz erken."` vs
`"Bu civarda kepenkler indi."` + countdown) is captured deterministically
in both palettes, rather than only the filtered-empty variant the
original script already had.

**What day confirmed (fixes #1 and #2).** `02-kesif-liste-gunduz.png`:
Yeldeğirmeni (399 m) then Moda Fırın (1,3 km) — ascending, fix #1. Every
line on both cards — `280–380₺ değerinde`, `399 m · 5 dk`, `1,3 km · 16
dk` — sets in full, no ellipsis, fix #2. `01-kesif-yukleniyor-gunduz.png`:
the closed placeholders sit at the same x as the loaded cards, fix #3.

**What only gece revealed.** The first night render
(`05-kesif-bos-gece.png`, before the fix below) showed the empty state's
heading and CTA — `"Bu civarda kepenkler indi."`, `"Haber ver"` — in
ivory text that was nearly invisible: correct colour, wrong background.
Tracing it: `Screen.tsx` (the app-wide screen wrapper, used by every
route, NOT a Phase 1 signature component) paints a hardcoded
`colors.neutral[50]` behind its content — a fixed light colour with no
idea the phase system exists. `ThemeProvider`'s own root `View` paints
`palet.bgAsfalt` behind the WHOLE app, but `Screen`'s own opaque
background sits on top of that for every individual route, so anywhere a
screen's own content doesn't paint over it, `Screen`'s light colour shows
through instead of the phase's. In **gündüz** this is invisible by
coincidence — the day palette's `bgAsfalt` (`#C7D0D2`, a cool light
"asphalt in daylight" grey) and `neutral[50]` are close enough in value
that the seam doesn't read as wrong. In **gece** (`bgAsfalt: #12181F`)
the two are nowhere close, and the empty state — mostly bare background
around one card — has nowhere for the loaded list's own opaque row
backgrounds to hide the seam. This is precisely the failure mode the
spec's own "daylight phase inversion" section was written to catch, just
running in the direction nobody had looked at.

**Fix, scoped narrowly.** `Screen.tsx` is shared by every route in the
app, not owned by this track, and is not on the locked Phase 1 list
either — the safer fix is local, not a change to shared infrastructure:
both `KesifEkrani` (`index.tsx`) and `HaritaEkrani` (`harita.tsx`) now
pass `style={{ backgroundColor: palet.bgAsfalt }}` into `<Screen>`, which
merges after `Screen`'s own hardcoded style and wins. Re-screenshotted
after the fix: the empty state, the loading state, the header, and the
map placeholder are now one continuous phase-correct surface in gece
(`Bu civarda kepenkler indi.` and `Haber ver` read at full contrast), and
gündüz visibly CHANGED TOO — from `neutral[50]`'s cream to the spec's own
cooler `#C7D0D2` "asfalt" grey, which is the more correct rendering
either way; it was never actually shown to the client through the right
colour before. `Screen.tsx` itself is untouched — every OTHER route still
gets its original light background, and any other phase-aware screen this
app grows later will need the same one-line override until someone
decides `Screen` itself should learn about phases, which is a call for
whoever owns that shared component, not this track.

**Also confirmed, not a bug:** prices render as `149Ł` instead of `149₺`
in the exported WEB build only. `fontkit` confirms both Chivo Mono TTFs
genuinely carry U+20BA (glyph id 638, not `.notdef`) — the font is
correct; `design-fonts-glyph-coverage.test.ts` already asserts this. The
web export's font subsetting drops the glyph from what the browser
actually loads, which is a property of the review surface (the same class
of limitation as `expo-secure-store`'s empty `{}` web build the previous
session already flagged), not of the native app the two platforms
actually ship.

---

## 5. Tests

- `src/__tests__/kesif.test.ts` — updated: the one test that encoded the
  reviewed defect (closing-time sort ignoring distance entirely) now
  reflects the 500 m-band rule; added a test reproducing the exact
  reviewed reversal and a test for within-band time ordering.
- `src/__tests__/duzen.test.ts` (new) — the spine/card width arithmetic:
  `SPINE_TOPLAM_GENISLIK`'s composition, the label held at 54pt, the
  computed width clearing the reviewed 291pt, the right gutter unchanged,
  the narrow-device floor.
- `src/__tests__/sokak-satiri-geometry.test.tsx` (new) — four tests
  proving the loading and loaded trees declare identical spine/card
  geometry (see §3).
- `e2e/scripts/kesif-shot.mjs` — extended (not rewritten) with the fixed
  day/night clock passes and a deterministic unfiltered-empty capture;
  the pre-existing day-only error-state capture's wait was bumped from
  1500ms to 6000ms — an aborted request is a network error, and
  `query-client.ts` retries those twice with backoff, so the original
  wait was catching the retry spinner, not the paper-note error card
  (unrelated to the three review fixes; found while re-running the
  script and worth leaving working for the next re-review).

Full suite: **35 suites, 486 tests, all green.** `tsc --noEmit` and
`expo lint` both clean.

---

## 6. Open items

- `Screen.tsx`'s hardcoded background is a real gap for ANY phase-aware
  screen, not just this track's two — flagged above, not fixed there,
  because it's shared, cross-track infrastructure and not this track's
  call to change unilaterally.
- The Harita bottom-sheet's "closes in" pill for a not-yet-open offer
  (`LEVENT FIRIN … 1 sa` in the gündüz capture, well before its own
  pickup window opens) wasn't investigated — pre-existing behaviour,
  outside the three reviewed findings, and outside this track's map-tab
  scope as reviewed.
- Night frames of the scrolled-map-header and error states weren't
  captured (only list/loading/empty were asked for) — the script now
  supports adding them the same way if a future review wants them.
