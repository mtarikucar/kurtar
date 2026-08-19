# Review — one walk through the whole app, gece

Surface: `e2e/scripts/tam-gezinti.mjs` against the merged tree (`798aa4a`)
and the real seeded backend. Frames: `/tmp/gece2/`.

Every earlier review looked at one track's screens. This one opens the app
the way a person does — sign in, discovery, a card, an order, the profile —
and asks whether those screens look like one app. They do not yet.

## How to reproduce (and why the earlier clock hacks were wrong)

Two build-time flags, both inlined as `undefined` in a normal build:

```
EXPO_PUBLIC_INCELEME_ZAMANI=2026-08-19T17:35:00.000Z   # pins the app's clock
EXPO_PUBLIC_FAZ_ZORLA=gece                             # pins the palette alone
```

`INCELEME_ZAMANI` goes through `ClockProvider`'s own `sabitZaman`, so ONE
instant governs the palette, every countdown and every open/closed label.

Faking the browser clock — which is what the per-track scripts did — does
not work and quietly lies. `Date.now()` freezes while the provider's
minute bucket keeps the pre-fake value, so the header said `12:47` while
the offer sheet said `şimdi 20:35`, and discovery's "N dükkân açık" was
counted against a different clock than the cards it sat above. I nearly
filed that count as a defect; it is an artifact. With the clock pinned
properly the screen agrees with itself: 20:35, `3 dükkân açık`, three open
shutters with light under them.

The session also cannot survive a `page.goto()` on web — `expo-secure-store`
has no web build, so the refresh token lives in memory for the tab's life.
Navigate by clicking, or every screen after the first photographs the
signed-out phone screen. (Four such frames are what sent me looking.)

## Verified good — do not rework

- **Discovery at night.** Shutters half up with warm light spilling under
  them, sodium price, the value bar, `SON 25 DK`. The gauge reads as a
  gauge. The left spine ascending 399 m → 1,3 km carries the walking
  decision.
- **Offer detail.** The pickup timeline (`19:00 ——▲—— 21:00`, `şimdi
  20:35`, `Kepenk 25 dk sonra iniyor`) is the signature idea working, and
  "Kutunun içi dükkânın o günkü fazlasıdır. Sürpriz olmasının sebebi bu —
  fotoğrafını kimse çekmedi." turns the no-photography constraint into the
  product's honesty. Leave both alone.
- **`KURTARILDI` stamp** on a past order — angled sodium fill on dark ink,
  reads as a rubber stamp on a receipt.
- **Impact block** on Profil: `1 paket kurtardın · 2,5 kg yemek çöpe
  gitmedi · 141₺ kazandın`, plus "En sık kurtardığın saat 19:15". Specific
  and honest, not gamified.

## To fix — A. the third of the app that was never anyone's track

21 files still import `colors` from `@kurtar/ui-tokens` and call
`usePalet()` zero times. Since `Screen` now paints the phase's ground
(`798aa4a`), these are no longer merely inconsistent — they are **broken at
night**: dark ink on a dark ground.

Measured on the frames:
- **Ara**: the "Ara" title and the "Ne aramak istersin?" heading are
  invisible. Category chips are bright white pills; the input is white.
  The label "Paket, mağaza ara…" also repeats verbatim as the placeholder.
- **Favoriler**: title and "Henüz favorin yok" both invisible.
- **Tab bar**: a pure white slab across the bottom of every night screen —
  the single most jarring thing in any frame.

In `gunduz` the same screens are legible but read as a different,
generic app: white pills, no shutter language, no sodium, none of the
mono utility face the rest of the app uses. So the conversion is not
only a night fix — it is the redesign reaching the third of the app it
never covered.

Screens: `(auth)/phone`, `(auth)/otp`, `(auth)/permissions`,
`(tabs)/_layout`, `(tabs)/search`, `(tabs)/favorites`, `store/[id]`,
`rate/[id]`, `cancel/[id]`.
Primitives: `Button`, `TextField`, `Chip`, `Badge`, `IconButton`,
`StarRating`, `EmptyState`, `LoadingState`, `ErrorState`, `FilterSheet`,
`DistrictPicker`, `OfferCard`.

`Screen`'s change is what exposed this; it is not what caused it. The
conversion is required before the redesign can be called done.

## To fix — B. on screens that WERE redesigned

1. **Siparişler is three-quarters void.** One past order, then an empty
   screen with nothing to do. An empty screen is an invitation to act;
   this one invites nothing. Same for Favoriler's empty state — it
   explains, then stops.
2. **Profil's loudest element is "Çıkış yap".** A full-width saturated red
   bar, more visually dominant than the impact numbers and the street
   above it. The least important action on the page is winning the page,
   and the red reads destructive.
3. **SENİN SOKAĞIN is ~40pt tall.** The signature element of the profile
   screen renders as one small shop and four grey blocks — at that size it
   reads as a progress bar, not a street. The low-count fix (three unlit
   frontages) is correct in substance and invisible in practice.
4. **The phone number is raw E.164**: `+905551110004`.
5. **Screen titles sit flush against the top edge** on Profil and
   Siparişler — check the top safe-area inset.

## Traps that produce a FALSE verification

- **`expo export -p web` caches inlined `EXPO_PUBLIC_*` values through
  Metro.** If the source file did not change, a rebuild silently keeps the
  PREVIOUS value. I rebuilt for `gunduz` three times and photographed the
  night build each time, with the build log cheerfully printing
  "Exported: dist". Always pass `--clear`, and prove which value landed
  before trusting a frame:
  `grep -c '2026-08-19T09:30' dist/_expo/static/js/web/*.js`.
- **`EXPO_PUBLIC_API_BASE_URL` is the ORIGIN, with no `/api`** — the
  client appends it. With the suffix every request becomes
  `/api/api/...` and 404s, which surfaces only as "login did not
  navigate".
- **The session does not survive `page.goto()` on web.** Navigate by
  clicking, or every frame after the first photographs the signed-out
  phone screen. Four such frames are what sent me looking in the first
  place.

## Two false alarms I nearly filed

Both were caught by measuring instead of reporting.

- **"1 dükkân açık" above two closed cards.** In the contaminated frames
  this was the two-clock artifact. In the clean midday frames it is
  simply TRUE: a fourth seeded offer (Levent Fırın, 08:00–14:10) is open
  and sits below the fold. My own `curl` had used an 8 km radius; the app
  queries 12 km. The predicate is correct — leave it alone.
- The `₺`/`Ł` glyph, below.

## Known false alarm — do NOT "fix"

The web export appears to render `₺` as `Ł` at 9–13pt. It does not: the
font carries U+20BA, `Intl` emits it, and a 120px render shows a correct
lira sign. The strokes merge at review sizes only. Two separate agents
have now reported this; the third should not.
