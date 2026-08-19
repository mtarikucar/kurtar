# Build log — Phase 0 (foundation) + Phase 1 (the signature)

Scope: `docs/design/consumer-app-spec.md` §6, Phase 0 and Phase 1. Nothing
beyond that; the three Phase 2 screen tracks depend on what is below and
are untouched.

Everything lives in `apps/consumer/`. Existing screens are unchanged apart
from the root layout, which now loads the three font families and mounts
the app-wide clock and theme.

---

## 1. What was built

### Phase 0 — foundation (`src/design/`)

| File | What it is |
|---|---|
| `tokens.ts` | Three complete palettes (`gece`, `alacakaranlik`, `gunduz`), each `Object.freeze`d at module scope and keyed identically so no component ever branches on phase. Plus the 4pt spacing scale, the radii (`card: 4`), the motion durations and the full type scale with absolute line heights. |
| `faz.ts` | The spec's `faz(now, sunset)` verbatim, `fazHesapla()` (see §4.7), and `gunesOlaylari()` — a local solar-position calculation for sunrise/solar noon/sunset. No network, ever. |
| `theme.tsx` | `ThemeProvider` (swaps the whole palette object on a phase change and cross-fades ONE overlay `View` for 600ms), `useTema()`, `usePalet()`, and a `fazZorla` pin the review screen uses. |
| `saat.tsx` | `ClockProvider`: one 60s minute bucket for the whole app, aligned to the wall-clock boundary, plus an opt-in 1Hz rail that does not create an interval until something subscribes and clears it when the last subscriber leaves. `sabitZaman` pins the clock for tests and the review screen. |
| `reduce-motion.ts` | `useReduceMotion()` — subscribed, not read once. Returns `boolean \| null` (see §4.4). |
| `tr-upper.ts` | `trUpper()`. No `.toUpperCase()` and no `textTransform` anywhere else in the app; static strings ship pre-uppercased from `tr.json`. |
| `fonts.ts` | The seven TTFs, imported per weight (not from the package roots, which `require()` eighteen cuts of Archivo at import time). |
| `motion.ts` | The easing curves for the duration tokens; `useNativeDriver` is off on web only. |
| `kontrast.ts` | WCAG contrast, used by the palette test. |

i18n: a `vitrin` block (pre-uppercased keys — `TÜKENDİ`, `SON {{dk}} DK`,
`SON {{adet}}`) and a `vitrinInceleme` block for the review screen, mirrored
key-for-key into `en.json`.

### Phase 1 — the signature (`src/components/kepenk/`)

`<Kepenk/>`, `<Tente/>`, `<Tabela/>`, `<ZamanHapi/>`, `<DegerCubugu/>`,
`<StokCipi/>`, assembled into `<VitrinKarti/>`, plus the pure modules they
rest on: `olcum.ts` (the gauge, the value comparator, the Turkish
formatters), `tente-desen.ts` (the hashed awning identity), `glyphs.ts`
(the six line-art category glyphs), `tr-saat.ts` (Turkish locative
suffixes for clock times), `svg-kimlik.ts` (unique `<Defs>` ids),
`gercek-teklifler.ts` (the four live offers and the six simulated times).

### The review gate

`/vitrin` — the four real offers at six simulated times (3sa · 90dk · 56dk ·
20dk · açılmadı · tükendi) in all three palette phases, plus a parts strip
showing the six awnings, four time-pill states, five stock-chip states and
two value bars in isolation. 72 cards on one screen.

To open it:

```bash
cd apps/consumer && npx expo export -p web && npx serve dist -l 8081
# then http://localhost:8081/vitrin
```

### Tests

9 new suites, 287 new tests (87 → 374 total), all green alongside the
existing suites; `tsc --noEmit` and `expo lint` clean.

- `design-fonts-glyph-coverage.test.ts` — fontkit over the seven shipped
  TTFs, asserting `ĞğŞşİıÇçÖöÜü` plus `×` (and `₺` on the money faces) are
  present and not `.notdef`. It carries a negative control (a CJK
  codepoint must come back missing) so an always-true assertion cannot
  pass silently. Verified against a real font that lacks the letters —
  the same probe over `Octicons.ttf` reports `false` for Ğ, ı and İ, so
  the guard genuinely fails when a Turkish glyph is missing.
- `design-contrast.test.ts` — every foreground/background pair in all
  three palettes against 4.5:1 (type) and 3:1 (objects), plus the ratios
  §1.1 publishes, plus the law that red is never type on a card.
- `design-faz.test.ts` — the three phases at fixed offsets, the solar
  calculation against published sunsets for İstanbul, London and New York
  (within a minute), the polar degradations, and the pre-dawn hole.
- `design-clock.test.tsx` — the minute bucket floors and flips exactly on
  the boundary and re-aligns rather than drifting; the 1Hz rail creates no
  interval until subscribed and exactly one for many subscribers.
- `design-theme.test.tsx` — phase selection off the solar clock at six
  timestamps, frozen palettes, key-set parity, absolute line heights, and
  the subscribed reduce-motion hook.
- `design-tr-upper.test.ts`, `kepenk-olcum.test.ts` (the gauge's worked
  values, the clamp-outside proof, monotonicity, the value comparator's
  direction, Turkish formatting and clock suffixes, the awning hash, the
  glyph mapping), `vitrin-karti.test.tsx` (24 tests over the real offers,
  including the composed accessibility label and the reduced-motion path).
- `design-yasaklar.test.ts` — §5 "What NOT to do" as executable rules:
  no `textTransform` anywhere, `.toUpperCase()` only inside `trUpper`,
  radius 4, no shadows or elevation in the signature, one pattern-filled
  rect rather than per-slat rects, `translateY` only and snapped to whole
  pixels, no SVG `<Text>`, no `'transparent'` gradient stop, no
  line-through price, `activeOpacity` as the entire press budget, no
  Lottie/confetti/shimmer/second animation engine in the dependencies, one
  rotated element on the card, and no image URL in the signature at all.

---

## 2. Dependencies added

| Package | Why it was necessary |
|---|---|
| `react-native-svg@15.15.4` | §2 requires the corrugation as one `<Pattern>`-filled rect; §3 requires the awning stripes as a `<Pattern>`, the category glyph as a 1.5pt `<Path>`, and the TÜKENDİ sticker as a torn-edge path. Nothing else can draw these. Version pinned to Expo SDK 57's `bundledNativeModules`. |
| `expo-linear-gradient@~57.0.1` | §1.3's elevation doctrine replaces shadows with painted gradients, and §3's vitrin light spill is one. Also required for §5.7's `rgba(R,G,B,0)` end stop. |
| `expo-haptics@~57.0.1` | §3's single `notificationAsync(Warning)` when the time pill crosses 30 minutes. One call site, platform-guarded off web. |
| `@expo-google-fonts/archivo`, `@expo-google-fonts/archivo-black`, `@expo-google-fonts/chivo-mono` | §1.2 names these three families and the exact install line. |
| `fontkit` (dev) | The §1.2 ship guard: glyph coverage asserted over the TTFs in CI rather than probed at runtime. |

**Not added, deliberately:** `react-native-reanimated`. §2's sketch uses
`useSharedValue`/`useDerivedValue`, but everything the signature actually
animates is a `translateY` on one view plus three opacities, which RN's own
`Animated` does with the native driver. A second animation engine for that
would be the §5.10 temptation in library form.

`expo-device` (already present) is what the `deviceYearClass < 2019`
degradation reads.

---

## 3. What I saw in the screenshots, and what changed because of it

Method: `npx expo export -p web`, `npx serve dist -l 8081`, then
`e2e/scripts/vitrin-shot.mjs` (Playwright/chromium, 1280×1000 at 2×, nine
frames down the review screen, plus a 390pt phone pass) and
`e2e/scripts/vitrin-zoom.mjs` (a 4× close-up of one card). Both scripts are
committed. Four rounds:

**Round 1.** Four defects, all invisible in the unit tests:

1. **The package name was cut in half by the price row.** The pavement
   block's rows summed to more than the 80pt left under the tabela. Fixed
   by putting the `×N değer` label in the price row (see §4.6), taking the
   value bar back to its 4pt spec height, and trimming the stock chip from
   22 to 18pt — 20 + 28 + 4 + 18, which is §3's own rhythm and fits.
2. **The vitrin was a dead black hole.** The light-spill gradient is
   top-anchored per §3, but the shutter covers the top, so the bright end
   was behind the metal and the open part — the one place the card is
   supposed to look lit — got the alpha-0 end. The gradient is now anchored
   to the **lip** and falls away downward, riding the same animated value
   as the shutter. Light now comes out of the opening and narrows as the
   kepenk comes down, which is both what a shop looks like and a better
   picture of the metaphor.
3. **The "3 hours left" frame rendered as AÇILMADI**, because an
   18:30–21:00 window has not opened three hours before it closes. That
   frame now uses a 16:30–21:00 window — a fırın on a long evening, which
   is exactly the case the gauge's absolute-minute normalisation exists to
   make comparable.
4. **`3 sa 0 dk`** in the pill. Now `3 sa`.

**Round 2.** The zoom showed the fırın glyph reading as a magnifying glass
(a stick with a circle on the end). Redrawn with a flat peel blade; it now
reads as a peel over a hearth at 14% opacity.

**Round 3–4.** Re-shot after the reduce-motion change (§4.4) to confirm no
card is stuck at its closed entry frame. Confirmed at 1280pt and at 390pt.

What the final screenshots show: the awning identity is legible at a
glance and different per shop; the shutter is a 5pt lintel at three hours,
half down at ninety minutes, 0.69 at 56 minutes and capped at 0.78; the
pill rides the lip and flips to awning red under 30 minutes; the sign
never gets covered; the day palette genuinely inverts (dark shutters on a
bright ivory card) rather than lightening; the sold-out card keeps its
sign, sinks to 45% and takes a torn TÜKENDİ sticker across the closed
metal.

---

## 4. Where I could not follow the spec as written

### 4.1 The twilight ground is `#7A868C`, not `#6E7A80`

§1.1 gives the twilight palette as a parenthetical pair and never measures
it. At `#6E7A80` **nothing** clears 4.5:1 for ground-level type: this
palette's darkest ink reaches 4.05:1 and even pure black tops out at
4.76:1. The ground is lightened to the nearest value that puts ground-level
type back over the floor the other two phases hold (4.78:1). The card stays
the spec's `#E3DAC8`. Asserted, with the failing original, in
`design-contrast.test.ts`.

### 4.2 Two published ratios do not survive measurement

The hex values are the source of truth and are unchanged; the printed
ratios are off:

- "`text.primary` … **14.6:1** on card" is the ivory-on-night-ground pair
  inverted, so it is **14.44:1**.
- "1pt `#A9B5B7` border (**1.27:1** against ground)" measures **1.34:1**.
  1.27:1 is the ivory **card** against that ground — which is exactly the
  difference the border exists to rescue.

Both are pinned as tests so the record is in the code.

### 4.3 The shutter is clipped by the band's `overflow: hidden`, not a `<ClipPath>`

§2's sketch clips an `<AnimatedG>` inside the SVG. The rule that matters —
"animate `translateY`, never the geometry props" — is kept exactly, and
moving the clip out to the containing `View` is strictly better: it removes
the Android clip-edge antialiasing problem that §2's rule 4 exists to work
around, and it means the transform is a plain view transform that the
native driver can take. The lip is still drawn as its own `<Rect>`
overlapping the boundary.

### 4.4 `useReduceMotion()` returns `boolean | null`

The platform answers asynchronously. A hook that reported `false` in the
meantime starts an entry roll one frame before learning it is not allowed
to — which the reduced-motion test caught. `null` means "not yet known";
every consumer treats it as "no movement" and starts the entry roll on the
first render where the answer is actually `false`.

### 4.5 `faz()` alone is night-blind before dawn

Between local midnight and sunrise, "now" is hours **before** that day's
sunset, so the spec's function returns `gunduz` — a bright ivory street at
04:00. `faz()` is kept verbatim; `fazHesapla(now, gunesOlaylari)` wraps it
and returns `gece` before sunrise. Both are tested.

### 4.6 `×N değer` sits in the price row, not on the bar row

§3's prose puts the 11pt label "right-aligned above the meta rail", but the
zone map has 4pt there. Putting the label beside the price (which is how
§4.3's detail screen sets it) keeps the bar at its spec height and the
whole block inside 196pt. The redundancy law is unaffected: the number is
in a fixed physical location adjacent to the shape it explains.

### 4.7 Small things

- **The tabela plaque is a per-phase token.** §1.1 defines the night plaque
  (`bg.derin` + ivory type) and says nothing about the day one; an ivory
  plaque on an ivory card is invisible, so the day/twilight plaques are a
  deeper ivory with dark ink — a painted sign, which is what a Turkish
  tabela usually is.
- **The time pill keeps a dark plate in every phase.** It rides the zinc
  shutter, and the metals do not change with the phase.
- **Archivo Black does not contain `₺`** (U+20BA). This is fine — the
  display face sets shop names and prices are Chivo Mono — and the font
  test records it per-face rather than requiring the lira sign everywhere,
  so the day someone typesets a price in the tabela face, the reason it
  renders tofu is written down.
- **Money formatting diverges from `src/lib/format.ts`.** The app's shared
  formatter prefixes (`₺149,00`); §1.2 requires the suffix with no space
  (`149₺`), so the design layer has its own `fiyatMetni()`. Phase 2 will
  need to decide whether the rest of the app follows.
- **The green awning is kept, muted.** §1.1 says there is no green in the
  app and §5.9 lists the specific temptations (success state, impact
  figures, the KURTARILDI stamp); §3 names `yeşil/beyaz` explicitly as one
  of six real awning combinations. It is rendered as a zinc-leaning
  `#5E7A62`, and the palette test bounds every other token away from green.
- **`glyphSec()` reads the shop name once.** A pastane and a fırın are both
  `BAKERY` in the API and are not the same shop to anyone standing in front
  of one, so a name that says pastane gets the cake dome. It is the only
  place the app reads a name for anything but display.
- **Turkish locative suffixes are computed, not hardcoded.** `18:30'da`,
  but `21:00'de` and `17:45'te`. A fixed `'da` gets a third of the seeded
  pickup windows wrong.
- **The card's screen-reader label uses digits, not spelled-out numbers.**
  §3's example reads "üç buçuk kat değer"; the label says "2,2 kat değer"
  and lets the screen reader speak the number, which is what it is for.
- **Walking time is dropped past 2,5 km.** "76 dk yürüme" for a 6,1 km shop
  is noise; distance alone is the honest line.

### 4.8 Not implemented, by scope

`deviceYearClass < 2019` degradation is wired into `<Kepenk/>` as a `basit`
prop with both fallbacks (flat zinc fill, flat spill) but nothing reads
`Device.deviceYearClass` yet — that belongs with the Phase 3 slow-Android
pass, where it can be measured. The 1Hz clock rail exists but is mounted by
nothing until the redeem screen (Phase 2, Track B).

---

## 5. Known noise

The exported web build logs two console errors on load, both pre-existing
and unrelated to the card: a React hydration warning (#418) from the
static export, and `ExpoNotifications.getLastNotificationResponse is not
available on web` from the root layout's push-deep-link effect. Neither
affects rendering; the web build is a review surface, and iOS/Android are
the shipping targets.
