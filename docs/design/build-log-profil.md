# Build log — Profil / Etki, review round 1 (the street's first state)

Scope: `docs/design/review-notes-profil.md`'s single "to fix" item — SENİN
SOKAĞIN at a low rescue count — plus its stated verification gap (night
palette, never captured). Everything else the review verified good
(impact copy, the two personal-detail lines, the trimmed menu, the ₺
glyph) is untouched, and the false alarm it named is not "fixed".

The street's own earlier iterations — the several rounds that took it
from "a bar chart with coloured caps" to the full-street render the
review verified good at 17 rescues — are recorded in the commit that
built it (`feat(consumer): rebuild orders, profile/impact and settings to
the kepenk design`), not in a separate log file. This entry starts from
that point.

---

## 1. The problem, precisely

At the seeded consumer's one rescue, `AySatiri` rendered exactly
`ay.kayitlar.length` storefronts and nothing else: a 26×44pt `<Svg>`
holding one lit window under one month label, floating in open space.
Every user is in this state at least once (rescue #1, by definition), and
the review named it the moment the reward loop most needs to work — the
existing full-street harness at 17 rescues said nothing about it.

## 2. The fix

`sokak-hesap.ts` gained a small, pure vocabulary for a "closed frontage" —
a place you have not rescued from yet:

- `SOKAK_DEVAM_DUKKAN_SAYISI = 3` — a fixed number of unlit, un-rescued
  frontages appended after the most recent real rescue.
- `KAPALI_DUKKAN_YUKSEKLIGI = 14` — the placeholder's own height, kept
  BELOW `DUKKAN_TABAN_YUKSEKLIK` (16, a real single visit's floor) on
  purpose, so a placeholder cannot be mistaken for a genuine rescue at a
  glance.
- `ayGenisligiDevamli(dukkanSayisi, devamSayisi?)` — a month row's total
  width once the continuation is included.

`SeninSokagin.tsx`: only the chronologically LAST month (the street's one
growing edge — every earlier month is settled history) now renders
`SOKAK_DEVAM_DUKKAN_SAYISI` additional `<Rect>`s after its real
storefronts, via a new `KapaliDukkan` shape — a plain zinc block, no
awning, no lit window, because there is no shop identity to draw yet and
nothing there has been rescued. It reuses the exact fill (`metalCinko`)
and is drawn by the exact same function `BosSokak` (the fully-empty
state) already used, so the empty street and a sparse street now speak
the same visual language instead of two unrelated treatments — `BosSokak`
was rewritten to call the same `KapaliDukkan` component instead of its
own inlined, slightly different copy.

This does not touch `RectGroupDukkan` (the real-storefront shape), the
gauge (`dukkanYuksekligi` / `dukkanParlakligi` / `dukkanPencereRengi`),
the awning path, or anything in `kepenk/` — the fix is additive geometry
on the one surface the review named.

**Screen-reader parity.** A sighted user now sees the street continue;
that information did not exist for anyone using the composed month label
before. `aySozelOzeti` now takes a `sonAy` flag and appends one sentence —
`profile.sokakDevamIpucu` ("Sokağın devamı henüz karanlık, kepenkler
kapalı" / "The rest of the street is still dark, shutters closed") — to
the most recent month's label only. The placeholder frontages themselves
are never counted or named in the summary (the whole `<Svg>` stays
`accessibilityElementsHidden`): the label reports exactly the real
rescues, then separately says, in words, what the continuation says in
pixels. This is the difference between describing a picture and lying
about one.

**Scroll behaviour, unchanged in code, re-verified.** The street already
auto-scrolled to the full content width on open (spec: "the far end is
where you started", scroll opens at the right/most recent edge). Because
the continuation now extends that same right edge, the existing
`scrollTo({ x: genislik })` call lands exactly past it — at low counts the
whole row (lit + closed) fits inside one phone width and never scrolls at
all; at the rich 17-rescue harness, the initial view now ends on the
continuation past August's last real rescue instead of stopping cold on
it. No scroll-position code changed; the effect falls out of the width
change alone.

## 3. Before / after at each rescue count

Captured via a new harness section (see §5) and read directly, not
inferred from the numbers.

- **0** — unchanged: `BosSokak`'s three closed shutters + "Henüz bir
  kurtarman yok." This state was never the review's complaint and still
  reads as "no shops lit yet", now sharing its exact shape with the
  continuation below.
- **1 (the review's named failure)** — before: one warm, dim window under
  a pink-hashed awning, alone, under "Ağustos 2026", with nothing to its
  right. After: the same lit shop, immediately followed by three flat
  zinc blocks continuing the row — it now reads as the first storefront
  on a street with more frontage ahead, not a stray tile.
- **2** — before: two lit windows (different awning hashes) with a hard
  stop after the second. After: same two, plus the continuation — the gap
  between "a pair" and "a street" closes.
- **3** — before: three lit windows, still a hard stop. After: three lit
  windows plus the continuation. At this count the row was already
  reading better before the fix than at 1, which is exactly why the
  review pinned the check to include the LOW end, not just the top.

## 4. What the night palette revealed that day had hidden

Nothing broke, but one thing was worth confirming rather than assuming:
`metalCinko` (`#5E6A67`) is the one token in `tokens.ts` that does NOT
vary by phase (build-log-foundation.md §4.7 already notes this for the
kepenk's time-pill plate) — so the closed-frontage colour is IDENTICAL
across gece / alacakaranlik / gündüz. Against gece's near-black asfalt
(`#12181F`) it reads as a dim, cool grey-green shutter, clearly a
different material from the warm lit windows next to it. Against gündüz's
light asfalt (`#C7D0D2`) the same fixed hex reads as a visibly DARKER
box — still legible as "closed", but by contrast rather than by
brightness, which is the opposite mechanism from the night read. Both
work; neither was previously screenshotted. The lit window's own
low-brightness state (a single visit sits at `DUKKAN_TABAN_PARLAKLIK =
0.3`, a deliberately dim glow per the existing design) was also unverified
at night specifically — it renders as a muted brown against gece's
near-black ground, clearly a warmer, lit object next to the flat, cool
closed frontages. Confirmed at 1, 2 and 3 rescues, in gece and gündüz,
via 2x full-row and 4x close-up captures.

## 5. Verification

`/sokak-inceleme` gained a second fixture below the existing 17-rescue,
three-phase one (untouched): a **DÜŞÜK SAYIM — 0/1/2/3 KURTARMA** matrix,
gece then gündüz, each showing all four counts against three distinct
shops (so 2 and 3 stay a clean read of separate storefronts rather than
also exercising the repeat-visit taller/brighter scale, which has its own
coverage in the rich fixture). Extends the existing harness in place —
no new review screen.

```bash
cd apps/consumer && npx expo export -p web && npx serve dist -l 8095
# then http://localhost:8095/sokak-inceleme
node ../../e2e/scripts/sokak-dusuk-sayim-shot.mjs   # the 0–3 matrix, both palettes
node ../../e2e/scripts/sokak-dusuk-sayim-zoom.mjs   # 4x close-up on "1 KURTARMA", both palettes
```

Both scripts are committed alongside the existing `sokak-shot.mjs` /
`sokak-zoom.mjs` / `sokak-zoom2.mjs`.

### Tests

10 new tests (492 → 502), `tsc --noEmit` and `eslint` clean:

- `sokak-hesap.test.ts` — `ayGenisligiDevamli` against the plain
  `ayGenisligi` it wraps (including an explicit-count override and the
  zero-continuation identity), and `KAPALI_DUKKAN_YUKSEKLIGI` pinned below
  `DUKKAN_TABAN_YUKSEKLIK` and inside the fixed `<Svg>` height.
- `senin-sokagin.test.tsx` — at 1, 2 and 3 rescues (`it.each`): the
  month's `<Svg>` width matches `ayGenisligiDevamli`, exactly one
  `RNSVGPath` per REAL rescue (never one for a placeholder), exactly
  `1 (pavement) + rescues + 3 (continuation)` total `RNSVGRect`s, and the
  trailing three share one fill (proving they are copies of one shape).
  Plus: the month label's rescue count never includes a placeholder ("1
  kurtarma", never "4"), and a two-month case proving the continuation
  appears ONLY on the most recent month — an earlier, settled month's
  label carries no "sokağın devamı" sentence and its `<Svg>` is exactly
  `ayGenisligi`, not `ayGenisligiDevamli`.

All 36 suites / 502 tests pass; `tsc --noEmit` and `eslint` are clean
across the whole `apps/consumer` package.

## 6. Left open

- The continuation count (3) and its height (14) are fixed constants, not
  derived from anything — a reasonable default, not a measured one. If a
  future design pass wants the street's growing edge to taper with total
  history size, both are single named exports in `sokak-hesap.ts`.
- The new `profile.sokakDevamIpucu` accessibility sentence is a judgement
  call, not something the review explicitly asked for — the review's own
  ask was visual ("give the street somewhere to go"). It was added
  because the sighted-only version of that information felt like a gap
  the task's own accessibility rule ("a horizontally scrolling street
  still needs a screen-reader path that is not 'scroll right'") argues
  against leaving open. If it reads as over-explaining in a future review,
  it is one string and one `sonAy ? … : …` branch to remove.
- `alacakaranlik` (twilight) was left out of the new 0/1/2/3 matrix — the
  review named gece and gündüz specifically ("both palettes"), and the
  existing 17-rescue fixture already exercises all three phases including
  twilight, so the closed-frontage colour's phase-invariance is covered
  there.
