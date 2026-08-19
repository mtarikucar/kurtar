# kurtar — Final Design Specification v1.0
**Direction:** *Kepenk Saati* (The Shutter Hour) as the spine, with mandated grafts from *Kıvrım* and *Son Işık*.
**Platform:** React Native / Expo. Turkish UI. Zero photography, permanently.

---

## 0. The decisions, up front

**Spine = Kepenk Saati.** It won two of three lenses (usability 8, engineering 9) and lost the third only on the charge that its architecture is conventional. That charge is answered below by killing the docked map as a permanent 168pt block and by taking the card off the "rounded white tile" chassis entirely (radius 4, fixed-Y tabela, no separators). The reasons it won are structural and not stylistic: it is the only direction whose time gauge is **normalised to absolute minutes**, so two cards are comparable; the only one that bounds the decorative layer so it can never occlude content; the only one with a value comparator (`×3,5 değer`); and the only one whose signature renders as one `<Pattern>`-filled rect on a `translateY`, i.e. one draw call per card.

**What I took from Kıvrım and why not the rest.** The perforation is the best *idea* in the set and the worst *object* on a phone: 3pt holes are not countable at arm's length, and a strip that tears left-to-right runs time backwards against Turkish reading order. I keep its principles — the **redundancy law**, **money never moves**, **4pt radius**, **per-notch haptics**, **discrete (not slowed) reduced-motion proof**, and the **platform shadow fallback** — and drop the paper, the four font families, the speckle PNG, the ±0.8° rotation and the one-shot tear. A tear you cannot undo is the single most hostile thing a redeem screen can do.

**What I took from Son Işık.** The **daylight phase inversion** (D3's only unanswerable flaw: a near-black list in 14:00 sun), the **one list-level clock**, the **no-shadow doctrine**, **absolute-pt line heights** for Turkish descenders, the **struck value as a range** rather than a fabricated single "was" price, the **full-screen light flood** — relocated to the handover confirmation where it does not compete with the code — and **stock as light**, bounded to ≤4 (humans subitize to four; past that a dot row is a serial count at 9pt in bad light, so past four it is a number).

**Bugs fixed rather than defended:** the clamp is on the wrong side of the subtraction in D3's gauge formula; the value bar fills the wrong way (fuller = worse deal); the tabela and the shutter geometrically overlap; `textTransform: 'uppercase'` is *not* locale-aware; JetBrains Mono carries an IDE association nothing here wants; nine haptic ticks in 700ms smear into a buzz on an ERM motor.

---

## 1. Design tokens

### 1.1 Palette

The palette is four physical things off a Kadıköy street at closing time — **zinc, painted sign ivory, sodium light, awning red** — plus two grounds. Every colour names an object, not a semantic slot. **There is no green anywhere in this app.** Every food-waste product on earth is green; a Turkish street at dusk is not, and the rescue reward is expressed as *light*, not as eco-mint.

**Gece (night phase — default from sunset−45min onward)**

| Token | Hex | Where |
|---|---|---|
| `bg.asfalt` | `#12181F` | App ground, list background, map land, modal scrim base |
| `bg.derin` | `#0E141A` | Tabela plaque fill, time pill fill, map water, redeem ground |
| `surface.kaldirim` | `#1B232C` | Storefront card surface, input fields, order rows |
| `surface.yukselti` | `#232D38` | Bottom sheets, tab bar, sticky CTA bar |
| `line.hairline` | `#2C3742` | 1pt borders, dividers where unavoidable |
| `metal.cinko` | `#5E6A67` | Shutter body fill |
| `metal.acik` | `#6A7673` | Corrugation light stripe |
| `metal.koyu` | `#4E5A57` | Corrugation dark stripe |
| `metal.dudak` | `#2A3330` | Shutter bottom lip (3pt) |
| `text.fildisi` | `#F2E6CE` | All primary type. **12.84:1** on card, **14.44:1** on ground |
| `text.sis` | `#9FB0AC` | All secondary type. **7.01:1** on card |
| `accent.sodyum` | `#FFB23F` | Prices, value-bar fill, CTA fill, storefront glow, lit stock dots. **8.83:1** on card. CTA ink is `bg.asfalt` on it: **9.93:1** |
| `alarm.tente` | `#E4593F` | Awning stripes, SON 1/2/3 chips, <30dk time pill, TÜKENDİ sticker |

`alarm.tente` is **4.93:1 against `bg.asfalt` but only 4.38:1 against `surface.kaldirim`.** Rule, non-negotiable: **red is never text on a card.** It is always a *fill* with `#12181F` ink on it, and it is always redundant with a number.

**Gündüz (day phase — before sunset−45min)**

The palette does not merely lighten; it inverts the light source. At noon the shutters are dark shapes against a bright street, and the card *becomes the painted sign*.

| Token | Hex | Notes |
|---|---|---|
| `bg.asfalt` | `#C7D0D2` | Cool pale slate — **not cream.** Cream-behind-content is the rejected default; here ivory is only ever paint on an object |
| `surface.kaldirim` | `#F2E6CE` | The sign ivory, now the card face. Needs a 1pt `#A9B5B7` border (1.27:1 against ground) |
| `text.primary` | `#12181F` | **11.37:1** on ground, **14.6:1** on card |
| `text.sis` | `#4B5A58` | **5.85:1** on card |
| `accent.sodyum.koyu` | `#8A4A05` | Amber *text* on light. **5.55:1** on card. `#FFB23F` survives only as a fill with dark ink |
| `alarm.tente.koyu` | `#A8321F` | **5.41:1** on card |
| metals | unchanged | Zinc reads as shadow-shape against bright ivory — the metaphor holds without a second set |

**Phase logic** is one pure function, ~30 lines, unit-testable at any timestamp:

```ts
type Faz = 'gunduz' | 'alacakaranlik' | 'gece';
function faz(now: Date, sunset: Date): Faz {
  const d = (now.getTime() - sunset.getTime()) / 60000; // dk
  if (d < -45) return 'gunduz';
  if (d < 25)  return 'alacakaranlik';   // ara palet: bg #6E7A80, kart #E3DAC8
  return 'gece';
}
```

Three discrete phases, **never an interpolation.** Colours are therefore stable references inside each phase and `StyleSheet.create` keeps its static advantage: build three frozen token objects at module scope and swap the whole object through a `ThemeContext` on phase change, with a 600ms cross-fade of an overlay `View` (not per-property colour animation). Sunset comes from a local solar-position calculation for the user's lat/lng — no network.

### 1.2 Typography

Three families, one foundry lineage, seven files.

```bash
npx expo install @expo-google-fonts/archivo @expo-google-fonts/archivo-black \
  @expo-google-fonts/chivo-mono expo-font
```

| Role | Face | Weights |
|---|---|---|
| **Display / signage** | **Archivo Black** (Omnibus-Type) | 400 (it is a single ultra weight), ALL-CAPS only |
| **Body / UI** | **Archivo** | 400 / 500 / 600 / 700 |
| **Data / numerals** | **Chivo Mono** (Omnibus-Type) | 500 / 700 |

**Why Chivo Mono and not JetBrains Mono.** A developer-tooling face carries an IDE association that a 24-year-old in Kadıköy does not want and the brief does not need. Chivo Mono is by the same Argentine foundry as Archivo, so the numerals share skeleton and metrics with the UI face instead of reading as a bolt-on, and it has the receipt/price-sticker register — the *kasa fişi* voice — that says "this figure is a fact from a machine." All three families ship the `latin-ext` subset including **U+0130 (İ) and U+0131 (ı)**, which is the pair that disqualifies most display faces.

**Monospace is chosen structurally, not stylistically.** `fontVariant: ['tabular-nums']` is iOS-solid and inconsistent on Android; a monospaced face makes tabular the default on both platforms with no feature flag. Consequences that matter: the redeem clock's seconds tick with zero layout jitter (a shifting clock reads as a rendered image; a rock-steady one reads as a clock), and prices align on the lira digit down the list so value comparison is a vertical scan.

**Ship guard, in CI, not at runtime.** A width probe can be fooled. Run `fontkit` over the three TTFs in a Jest test and assert coverage of `ĞğŞşİıÇçÖöÜü` (U+011E/011F, U+015E/015F, U+0130/0131, U+00C7/E7, U+00D6/F6, U+00DC/FC). Fail the build rather than ship tofu to a Turkish user.

**Scale.** All sizes pt. Line heights are **absolute, never multipliers** — Android clips ğ/ş/ç descenders and the İ dot at tight multiplied leading, and it is the single most common Turkish typesetting bug.

| Token | Face | Size / LH / Tracking | Use |
|---|---|---|---|
| `tabela.xl` | Archivo Black | 28 / 32 / −0.6, caps | Shop name: detail header, redeem |
| `tabela.lg` | Archivo Black | 20 / 24 / −0.2, caps | Shop name on the card plaque |
| `clock` | Chivo Mono 700 | 56 / 60 / 0 | Redeem live clock |
| `code` | Chivo Mono 700 | 44 / 48 / +6 | Redeem 4-digit code |
| `price.xl` | Chivo Mono 700 | 40 / 42 / −0.5 | Detail price |
| `price.lg` | Chivo Mono 700 | 26 / 28 / −0.3 | Card price |
| `title` | Archivo 600 | 17 / 22 / −0.1 | Screen titles, sheet titles |
| `paket` | Archivo 500 | 15 / 20 / 0 | Package name |
| `body` | Archivo 400 | 15 / 22 / 0 | Descriptions, running text |
| `body.strong` | Archivo 600 | 15 / 22 / 0 | Inline emphasis |
| `data` | Chivo Mono 500 | 12 / 16 / +0.4 | Meta rail, time pill, distance, stock |
| `data.lg` | Chivo Mono 700 | 15 / 20 / +0.2 | Order codes, impact figures |
| `label` | Archivo 500 | 12 / 16 / +0.9, caps | Section labels (ALIŞ PENCERESİ) |
| `micro` | Archivo 500 | 11 / 14 / +0.6, caps | ×3,5 değer; chips |

**11pt is the floor and is used only for labels redundant with something larger.** Nothing decision-critical is below 12.

**Dynamic type.** `allowFontScaling` stays true everywhere. `maxFontSizeMultiplier`: 1.4 on the tabela, 1.3 on the time pill and stock chip, 1.6 on the redeem clock and code. At `PixelRatio.getFontScale() ≥ 1.3` the kepenk band goes 68 → 78, the tabela strip 40 → 48, and the price row reflows from side-by-side to stacked. **The card's height is measured, not stated:** this spec used to say "196 → 232pt", and 232 is arithmetically short by ~33pt — at 1.3× the pavement alone needs ~265pt, so the meta rail was clipped off the bottom of every card. The height comes from `kartOlculeri(fontScale)` (`components/kepenk/kart-olcu.ts`), which derives it from these tokens; nothing may restate it as a constant. **The gauge recomputes from `bandHeight`, so it stays honest at every text size.**

**Turkish casing — the rule that breaks everything if missed.** Never `.toUpperCase()` (`'ı'.toUpperCase()` → `I`, and `'istanbul'` → `ISTANBUL` not `İSTANBUL`). Never `textTransform: 'uppercase'` — it is **not** locale-aware: Android applies the *device* locale and iOS applies a non-localised uppercase, so a Turkish UI on an English-locale phone mis-cases the brand's own tabela. Do not trust Hermes to ship full ICU.

- **Static UI strings:** ship pre-uppercased from `tr.json`. `"ALIŞ PENCERESİ"`, not `"Alış penceresi"` + a transform.
- **Dynamic strings (shop names from the DB):** one explicit helper.

```ts
const TR_MAP: Record<string,string> = {i:'İ', ı:'I', ğ:'Ğ', ü:'Ü', ş:'Ş', ö:'Ö', ç:'Ç'};
export const trUpper = (s: string) =>
  s.replace(/[iığüşöç]/g, c => TR_MAP[c]).toUpperCase();
// trUpper('Yeldeğirmeni Pastanesi') -> 'YELDEĞİRMENİ PASTANESİ'
// trUpper('Moda Fırın')             -> 'MODA FIRIN'
```

**Number formatting:** `Intl.NumberFormat('tr-TR')` — comma decimal, dot thousands (`2,1 km`, `1.249₺`, `×3,5`), **₺ after the numeral with no space**, 24-hour time throughout.

### 1.3 Spacing, radii, elevation, motion

**Spacing** — 4pt base: `s1 4 · s2 8 · s3 12 · s4 16 · s5 20 · s6 24 · s8 32 · s10 40`. Screen gutter `s4`. Card-to-card gap `s3`.

**Radii** — `r.card 4 · r.plaque 3 · r.pill 10 · r.sheet 16 · r.cta 6`. **The 4pt card radius is load-bearing.** Shopfronts and shutter boxes are not pill-shaped, and this single number does more anti-template work than any effect in the system: it is the fastest visual separation from the rejected rounded-white-card build.

**Elevation — the doctrine: zero shadows, zero elevation, depth painted into the artwork.** iOS `shadowRadius/offset/opacity` and Android `elevation` are two different physics engines and cannot be made to match. Every card, chip and plaque in this app therefore gets:

- a 1pt top hairline in `rgba(242,230,206,0.07)` — light landing on an edge;
- a 1pt bottom border in `#0E141A` — the contact edge where the object meets the pavement;
- and where it needs to feel lit, a painted `expo-linear-gradient`, not a shadow.

Result: `elevation: 0` everywhere, and iOS and Android are identical for free.

**The one exception,** for surfaces that float *over* content and must be unambiguously separated — bottom sheets, the sticky CTA bar, the map's bottom sheet:

```ts
floating: Platform.select({
  ios: { shadowColor:'#000', shadowOpacity:0.5, shadowRadius:12, shadowOffset:{width:0,height:-6} },
  android: { elevation: 8, borderTopWidth: 1, borderTopColor: '#0E141A' }, // hard contact edge, no spread
})
```

**Gradients:** every fade must end at `rgba(R,G,B,0)`, **never** `'transparent'`. `expo-linear-gradient` on Android interpolates through `#00000000` and produces a visible grey smudge at the fade.

**Motion tokens.**

| Token | Duration | Easing | Use |
|---|---|---|---|
| `m.press` | — | `activeOpacity 0.85` | The entire press budget. No scale, no glow |
| `m.fast` | 150ms | `Easing.bezier(0.2,0,0,1)` | Map pin selection, chip state |
| `m.base` | 220ms | `Easing.bezier(0.2,0,0,1)` | Card shutter entry, sheet content |
| `m.snap` | 180ms | `Easing.out(Easing.quad)` | Shutter position update on the 60s tick |
| `m.roll` | 700ms | `Easing.bezier(0.16,0.84,0.3,1)` | The kepenk roll (redeem, purchase) |
| `m.flood` | 400 in / 2200 hold / 350 out | `Easing.out(Easing.cubic)` | The handover light flood |
| `m.phase` | 600ms | linear | Day↔night palette cross-fade overlay |

**The shutter snaps on a 60-second tick with `m.snap`; it never creeps.** A continuously sliding gauge is anxiety on a screen the user is holding while walking, and it burns battery for a change no one can perceive within a second.

---

## 2. The signature element — KEPENK

**What it is.** Every offer on every surface wears a corrugated steel shutter over its shopfront, and **how far the shutter has rolled down is how little time is left.** Nothing else in the app encodes time; this is the clock. The tabela — the painted sign — sits *below* the shutter band, exactly as on a real Turkish shopfront where the sign is mounted above the opening and the kepenk comes down over the vitrin. That is what fixes D3's geometric contradiction: **the shutter can never touch the shop's name, because architecturally it never did.**

**What it encodes.**

```ts
const H_DK = 180;
export function kepenkP(minutesLeft: number, state: OfferState): number {
  if (state === 'tukendi')  return 1.0;   // only state allowed past the cap
  if (state === 'acilmadi') return 0.78;  // window not open yet
  return clamp(1 - minutesLeft / H_DK, 0.08, 0.78);
}
```

`clamp` is on the **outside** of the subtraction — D3's spec had it inside and produced 22% at three hours instead of 8%. Worked values: ≥3sa → 0.08 (a 5pt lintel: reads as the shutter *box*, the shop is wide open) · 90dk → 0.50 · 56dk → 0.69 · 20dk → 0.78 (capped) · tükendi → 1.00.

**Normalised to absolute minutes, never to the shop's own window.** This is the whole reason the gauge works: a shutter at 0.69 means 56 minutes on *any* card in the list. A per-shop fraction would mean "what percentage of this particular shop's evening has passed," which is not comparable between a manav on a 30-minute window and a fırın on a five-hour one — and comparability is the only job the gauge has.

**The cap at 0.78 is a hard rule:** the gauge is bounded to its own band and may never occlude the shop name, the price, the value bar or the pickup window. The decorative layer is forbidden from eating content.

**Redundancy law (from Kıvrım, adopted as system law):** *every shape-encoded quantity carries its literal number in the same fixed physical location.* The shutter always carries a time pill welded to its lip (`2 sa 26 dk`, `56 dk`, `SON 18 DK`). Stock always carries `son 6`. The value bar always carries `×3,5 değer`. The glyph and the number teach each other in the first two seconds; from session two the number is redundant and the shape does the work. If an encoding needs a tooltip, it has failed and should be deleted.

**Implementation.** One component, `<Kepenk band={h} p={sv} state={...} />`, ~120 lines, used on six surfaces.

```jsx
<View style={{height: band, overflow:'hidden'}}>            {/* vitrin */}
  <LinearGradient colors={['rgba(255,178,63,0.16)','rgba(255,178,63,0)']}
                  style={StyleSheet.absoluteFill} />        {/* ışık taşması */}
  <Svg width={W} height={band}>
    <Path d={GLYPH[kategori]} stroke="rgba(242,230,206,0.14)" strokeWidth={1.5} fill="none"/>
    <Defs>
      <Pattern id="oluk" width={8} height={1} patternUnits="userSpaceOnUse">
        <Rect x={0} width={4} height={1} fill="#6A7673"/>
        <Rect x={4} width={4} height={1} fill="#4E5A57"/>
      </Pattern>
      <ClipPath id="kutu"><Rect width={W} height={band}/></ClipPath>
    </Defs>
    <AnimatedG clipPath="url(#kutu)" animatedProps={rollProps}>  {/* translateY only */}
      <Rect width={W} height={band} fill="url(#oluk)"/>
      <Line x1={W*0.3} y1={0} x2={W*0.3} y2={band} stroke="rgba(242,230,206,0.10)" strokeWidth={1}/>
      <Rect y={band-3} width={W} height={3} fill="#2A3330"/>
      <Rect y={band-4} width={W} height={1} fill="rgba(242,230,206,0.15)"/>
    </AnimatedG>
  </Svg>
  <ZamanHapi/>   {/* absolutely positioned, follows the lip */}
</View>
```

Four engineering rules that are the difference between 60fps and jank on a 720p Android:

1. **One `<Rect>` filled by a `<Pattern>`, not one node per slat.** Twelve stripes at 358pt is one draw call; twenty-six `<Rect>`s per card × a FlashList window is 300+ nodes re-parsed on every recycle.
2. **Animate `translateY` on a clipped `<G>`, never the `y`/`height` geometry props.** Animating RNSVG geometry goes through prop setters and invalidates the path on Android; a transform never touches layout. Snap the translate to whole pixels — `<Pattern>` tiling seams at fractional offsets.
3. **One shared clock for the whole list.** A single `useSharedValue<number>` minute bucket, ticked by one `setInterval` at the provider level; every gauge is a `useDerivedValue` off it. Never a timer per card.
4. **The bottom lip is drawn as its own antialiased `<Rect>` overlapping the clip boundary,** because `<ClipPath>` disables antialiasing on the clip edge on Android and the lip would otherwise be jaggy — and the lip is the element the eye actually tracks.

**Degradation.**
- **Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled`, *subscribed*, not read once): shutters render at their final position; no entry roll, no stagger. Positions still update on the 60s tick, instantly. The redeem roll becomes a 600ms press-and-hold with a sodium fill sweeping the handle — **the ritual survives, the movement doesn't** — and the haptics are unchanged.
- **Slow Android:** if `Device.deviceYearClass < 2019`, drop the corrugation `<Pattern>` to a flat `#5E6A67` fill with a single 1pt specular line, and drop the light-spill gradient to a flat `rgba(255,178,63,0.10)` `View`. Two conditionals, and the gauge — which is the information — is untouched.
- **Screen reader:** the whole gauge is `accessibilityElementsHidden`; the card exposes one composed label (§4).

**The inversion, which is the emotional arc.** Shutters go *down* everywhere, all evening, by themselves. They go **up** in exactly two places: purchase confirmation, and the redeem swipe. Everything in this app is closing, and you made one thing open. That is the entire feeling of the product, and it is why a pessimistic-looking metaphor is not a pessimistic app.

---

## 3. The offer card

**Fixed 358 × 196pt** (390 screen − 16pt gutters), radius 4, `overflow: hidden`, `elevation: 0`. Fixed height so FlashList's `estimatedItemSize` (208 with gap) is exact, and so the eye can fix a column while scrolling. **No rotation, ever** — Kıvrım's ±0.8° tilt is charming and it disables subpixel text antialiasing on Android (transformed views rasterise into a hardware layer), softening a 20pt Archivo Black shop name on the exact device where legibility is thinnest, while simultaneously destroying the price-column alignment the mono face just bought.

**No separators, no dividers.** Storefronts sit on the dark street with 12pt gaps.

### Zones (y from card top)

**`0–6` · TENTE — the awning strip.**
A 6pt band of 14pt diagonal stripes, `react-native-svg` `<Pattern>`, clipped to the top radius. The stripe pair is chosen deterministically from `hash(shopId) % 6` over six real Turkish awning combinations: kırmızı/beyaz, yeşil/beyaz, mavi/beyaz, sarı/lacivert, pembe/krem, turuncu/beyaz — rendered in the app's own values so they sit in the palette. **This is the shop's permanent identity mark.** It replaces the logo we don't have and the photograph we will never have: Moda Fırın is always *the red-and-white one*, and you learn it in two sessions. Ten lines of code, zero assets, zero network, zero cache invalidation.

**`6–74` · KEPENK BANDI — 68pt.**
Sodium light-spill gradient (top-anchored, ending at alpha 0), a 1.5pt line-art category glyph at 14% ivory (`fırın` = peel + oven arch, `pastane` = cake dome on a counter, `manav` = hanging pan scale, `kafe` = portafilter — **we draw the shop's tools, which we know, never the bag's contents, which we don't**), and the shutter group over it. `shutterH = 68 × p`, so 5.4pt at ≥3 hours and 53pt at ≤20 minutes.

**The time pill rides the lip.** 68 × 20pt, welded to the shutter's bottom edge, right-inset 12pt. Fill `#0E141A`, 1pt `metal.cinko` border, radius 10, `data` 12pt ivory: `2 sa 26 dk`. Under 30 minutes it flips to `alarm.tente` fill with `#12181F` Archivo 700: `SON 18 DK` — one 300ms cross-fade and one `notificationAsync(Warning)` haptic, **once**, never a pulse. Before the window opens: `18:30'da açılıyor`.

**`74–114` · TABELA — 40pt, fixed Y.**
The plaque: 334 × 34, fill `bg.derin`, 1.5pt `rgba(242,230,206,0.35)` border, radius 3, with **two 3pt ivory dots inset 6pt at each end** — the mounting bolts every real Turkish sign has, and the kind of observed detail no template contains. Inside, real RN `<Text>` (never SVG `<Text>` — Android RNSVG resolves fonts through its own Typeface lookup and silently falls back to Roboto, which in a Turkish app means losing the drawn ğ and İ): `tabela.lg`, Archivo Black 20 caps, ivory, one line, `numberOfLines={1}` tail-truncated at the word.

`YELDEĞİRMENİ PASTANESİ` sets at 20pt in 310pt of inner width. Longer names truncate; they do not wrap, because a fixed Y is worth more than a second line.

**`114–190` · KALDIRIM — the pavement block. Never covered by anything.**

```
114–134   Pastane Sürpriz Kutusu              paket · Archivo 500 15/20, ivory 92%
138–164   149₺                180–300₺ değerinde
          price.lg, sodyum    Archivo 500 12, text.sis, right-aligned
166–170   ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱   değer çubuğu, 4pt
174–190   18:30–21:00 · 120 m · 2 dk          ⟨ son 6 ⟩
          data 12, text.sis                    stok çipi
```

**No struck-through original price.** The live data has no single "was" price, and a bag whose contents are a range does not have one; inventing `4̶4̶7̶₺̶` to strike is a lie, and printing it next to a range that contradicts it makes the user reconcile two numbers to answer one question. The truth is the **range**, and the bar makes it felt.

**Değer çubuğu.** 4pt track `rgba(242,230,206,0.14)`, filled left-to-right in sodyum, with an 11pt `micro` label right-aligned above the meta rail.

```ts
const oran = ((deger.dusuk + deger.yuksek) / 2) / fiyat;
const dolu = clamp((oran - 1) / 3, 0.04, 1);   // fuller = better deal
const etiket = `×${oran.toLocaleString('tr-TR',{maximumFractionDigits:1})} değer`;
```

Yeldeğirmeni: 240/149 = 1,61 → 20% full, `×1,6 değer`. Moda Fırın: 240/69 = 3,48 → 83% full, `×3,5 değer`. **D3 filled this by `price/midValue`, so a fuller bar meant a worse deal** — inverted against every progress bar the user has ever met, and actively misleading for the two seconds before the label is read. Fixed.

**Stok çipi — the graft from Son Işık, bounded.** Above 4 remaining: a hairline pill, `data` 12, `son 6`. **At ≤4 remaining, N lit 8×8pt rounded squares in `#FFE0A8` appear before the number** — `▪▪▪ son 3` — because four is the subitizing limit and a dot row past it is a serial count at 9pt in bad light. At ≤2 the pill flips to `alarm.tente` fill with `#12181F` Archivo 700: `▪ SON 1`, and that single square breathes 0.55 → 1.0 over 2.4s (a plain `View` opacity on the UI thread, not an SVG prop; static under reduced motion). One light on in a nearly-closed shop is a picture of scarcity that is also the fact of scarcity.

### Variants

**TÜKENDİ.** Shutter at 1.0, light-spill gradient off, tabela dark (ivory at 22%). A **TÜKENDİ** sticker — Archivo Black 15, `#12181F` on `alarm.tente`, rotated −4° via a static `transform` (one element, no text inside it that needs subpixel AA), torn-edge SVG path — taped across the closed metal. The kaldırım block stays fully legible at 45% opacity; the meta rail becomes `yarın 18:30'da açılıyor` with a bell affordance. **Sold-out cards do not vanish from the list**; they sink to a `KAÇIRDIKLARIN` section at the bottom, so scarcity is felt rather than hidden. Nothing is greyed into unreadability — a closed shop is still a shop you might come back to.

**AÇILMADI.** Shutter at 0.78, pill reads `18:30'da açılıyor`, CTA on detail is disabled. The same object reads "opening", not only "closing."

**Accessibility.** Tente, kepenk, glyph, bar and plaque are `accessibilityElementsHidden`. The card is one 196pt target exposing one label:

> `"Yeldeğirmeni Pastanesi. Pastane Sürpriz Kutusu. 149 lira, 180 ile 300 lira değerinde, üç buçuk kat değer. Son 1 paket. Alış 18:30–21:00, kapanmasına 18 dakika. 120 metre, 2 dakika yürüme."`

---

## 4. Screens

### 4.1 KEŞİF — discovery (the heart)

**The map is a collapsing header, not a permanent 168pt block.** At rest it is 168pt; on the first 112pt of scroll the *container* height animates 168 → 56 with `overflow: hidden` while the `MapView` inside keeps a constant 168pt height and translates up. The `MapView` is never resized (resizing a live map is the most expensive thing on this screen). This buys 2.3 cards at rest and **3.1 after the first flick**, and it answers the "docked map over bound list is the Getir frame" charge: the map is a place you start from, not furniture.

```
┌───────────────────────────────────────────────┐
│ ◉ KADIKÖY ▾            18:34         ☰        │ 52pt, data clock (minute only)
├───────────────────────────────────────────────┤
│  HARİTA — 168pt → 56pt (kaydırınca)           │
│    ╔═══╗          ╔════╗                      │ fiyat pinleri
│    ║69₺║          ║149₺║ ◄ seçili             │
│    ╚═══╝          ╚════╝     ◉ SEN            │
│  ──────  4 dükkân açık  ──────                │
├───────────────────────────────────────────────┤
│      ┃  ── YELDEĞİRMENİ ────────────────      │
│ 120m ┃  [ storefront card ]                   │
│      ┃                                        │
│ 400m ┃  [ storefront card ]                   │
│      ┃  ── BEŞİKTAŞ · vapurla 20 dk ──        │
│ 2,4km┃  [ storefront card ]                   │
├───────────────────────────────────────────────┤
│  ▣ Keşfet   ⌗ Harita   ⊟ Siparişler  ◉ Profil │ 83pt
└───────────────────────────────────────────────┘
```

**The street spine.** A 1pt `line.hairline` rule down the left gutter with mono distance labels (`0 m`, `120 m`, `400 m`, `2,4 km`) pinned beside each card. Scrolling down is walking away from where you stand. This is the only element in any direction designed for someone **deciding while walking**, and it costs one `View` and one `<Text>` per card.

**Sort:** by closing time ascending within distance tiers, not by price. The scarce resource is time.

**Filter chips** (horizontal scroll, 36pt, radius 10): `TÜMÜ · FIRIN · PASTANE · MANAV · KAFE · MUTFAK`. Pre-uppercased in `tr.json`.

**Header copy:** `4 dükkân açık` · `Kadıköy'de 11 kepenk hâlâ açık` when >8.

**Component tree:**
```jsx
<SafeAreaView bg=asfalt>
  <Baslik/>                                  // konum seçici + saat + menü
  <Animated.View style={haritaKabi}>         // height 168→56
    <MapView pointerEvents={collapsed?'none':'auto'} .../>
  </Animated.View>
  <FlashList
     estimatedItemSize={208}
     ListHeaderComponent={<Cipler/>}
     renderItem={({item}) => <SokakSatiri mesafe={...}><VitrinKarti offer={item}/></SokakSatiri>}
     ItemSeparatorComponent={null}
     stickySectionHeadersEnabled={false}
  />
  <TabBar/>
</SafeAreaView>
```

### 4.2 HARİTA — map

Full-screen. `react-native-maps` with **`provider={PROVIDER_GOOGLE}` on both platforms** — Apple's provider ignores `customMapStyle`, so the dark Kadıköy style is only achievable via Google; this drags in the Maps SDK and an API key, and that config must be in the plan from day one, not discovered in week three.

- **Style:** land `#12181F`, water `#0E141A`, roads `#1B232C`, labels `text.sis`, no POI icons.
- **Markers are price chips**, 56 × 28, `bg.derin` fill, 1pt zinc border, `data` 12 ivory: `69₺`. Selected: `accent.sodyum` fill, `#12181F` ink, lifted 8pt.
- **The Android marker rule, non-negotiable:** render each marker once, then set `tracksViewChanges={false}` in an `onLayout` callback. Custom-View markers on Android are bitmap snapshots; leaving `tracksViewChanges` true through an animation is the classic marker flicker. Selection therefore changes only on **discrete states** (normal / seçili / tükendi) with a one-frame re-snapshot, never a continuous animation. This is why "the map darkens shop by shop through the evening" is implemented as a **60-second bucketed re-snapshot**, not a live tween.
- **Two-way binding:** tapping a pin scrolls the list beneath to that index (`scrollToIndex`, animated) and vice versa. No toggle — you do not toggle a neighbourhood.
- **Bottom sheet** at 180pt: the three nearest offers, sorted by closing time, as 72pt compact rows (tente strip 4pt · name · price · time pill).

### 4.3 TEKLİF DETAYI — offer detail

```
←                                        ♡    ⤴
╔══════════════════════════════════════════════╗
║ tente 8pt                                    ║
║ kepenk bandı 128pt  ·  [ 2 sa 26 dk ]        ║
║ ┌──────────────────────────────────────────┐ ║
║ │  YELDEĞİRMENİ PASTANESİ                  │ ║  tabela.xl, 56pt plaque
║ └──────────────────────────────────────────┘ ║
║ Pastane · Yeldeğirmeni, Kadıköy   ★ 4,7 · 212║
╚══════════════════════════════════════════════╝

VİTRİN — bu kutuda ne olabilir?
  poğaça · kurabiye · günün pastası · ekmek · açma
  geçen hafta çıkanlar
  tuzlu kurabiye ×4 · vişneli kek ×3 · su böreği ×2
  ≈ 1,2 kg · 2 kişilik · fındık, süt, gluten içerebilir

Kutunun içi dükkânın o günkü fazlasıdır. Sürpriz
olmasının sebebi bu — fotoğrafını kimse çekmedi.

149₺   ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱   ×1,6 değer
       180–300₺ değerinde

ALIŞ PENCERESİ
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ BUGÜN  18:30 ──────▲ şimdi 18:34 ──── 21:00 ┃
┃ Kepenk 2 sa 26 dk sonra iniyor              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

YÜRÜYÜŞ                          2 dk · 120 m
Osmanağa Mah. Karakolhane Cd. 12/A
[ Haritada göster ]        [ Yol tarifi ⤴ ]

DÜKKÂN NOTU
"Akşam 20:00'den sonra gelirseniz pasta biter,
 poğaça hep olur." — Yeldeğirmeni Pastanesi
──────────────────────────────────────────────
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃          KUTUYU AYIR · 149₺              ┃  56pt, sodyum fill,
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  #12181F ink, r 6
              son 1 paket kaldı
```

The **VİTRİN** section is the honest answer to "what's in it?": not a photograph, not a guess — the shop's own category list plus *what actually came out last week*, which is real data the merchant app already produces. `Sürpriz olmasının sebebi bu — fotoğrafını kimse çekmedi.` is the one place the app explains its own constraint, in plain Turkish, once.

### 4.4 SATIN ALMA — purchase confirmation

Full-screen, not a toast. **The shutter rolls up** — the first of the app's only two upward rolls. 700ms `m.roll`, sodium floods behind the rising metal, then the lit tabela settles and the order ticket slides down over 320ms.

```
             ✓  (yok — ışık var, tik yok)

        ·[ YELDEĞİRMENİ PASTANESİ ]·

        Pastane Sürpriz Kutusu · 1 adet
        149₺ ödendi · #A8213

        BUGÜN 18:30 – 21:00 arası al
        Kendi çantanı getir

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃            KEPENGİ AÇ                    ┃  → redeem
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
        Siparişlerim'de de duruyor
```

**No confetti.** Celebration in this app is expressed as light level, once. Haptic: `notificationAsync(Success)` at the moment the sign lights.

**Sold-out-at-checkout** (the money-path failure): the shutter slams down over 240ms, one `impactAsync(Heavy)`, the tente-red flash, and `Az önce kapandı.` followed immediately by the nearest alternative card — not a dead-end alert.

### 4.5 KEPENK — redeem (the defining interaction)

The customer holds the phone up; a stranger behind a counter has three seconds and bad lighting. Three jobs: be unmistakably this app, prove it is live, end in a moment worth the walk.

**State A — closed (this is what a screenshot captures).**
Full-bleed corrugated zinc, top to bottom. The tabela is visible behind it but **unlit** — ivory at 22%, `MODA FIRIN`. **No code. No clock. No order.** A 64pt handle at the bottom: ivory chevrons, `KEPENGİ KALDIR` Archivo Black 15 with `yukarı kaydır` beneath.

Screenshot this and you have a picture of a closed shop. **The code does not exist on screen until the swipe happens.** That is a structural anti-fraud property, not a cosmetic one — and it is the reason this design beats a static QR.

**The swipe.** Drag up ≥140pt. Screen brightness ramps to 1.0 (`expo-brightness`, restored on unmount); auto-lock disabled. The shutter rolls over 700ms `m.roll` with **haptic ticks at decelerating intervals — nine on iOS, three on Android.** Nine `impactAsync(Light)` calls inside 700ms smear into one continuous buzz on an ERM motor; three read as corrugations on both. Ticks are scheduled from JS as absolute timestamps taken at gesture-release, so they do not drift against the UI-thread animation. The last tick is `Medium` and lands exactly when the sign lights.

**State B — open. Ordered by the staff member's task, not the customer's.**

```
    ·[  M O D A   F I R I N  ]·        tabela.xl 28 caps, lit, sodium bloom
       Moda, Kadıköy

         1 8 : 3 4 : 0 7               clock, Chivo Mono 700 56, tabular
         ─────────────►                NABIZ: 3pt ivory sweep, 1×/sn
         19 Ağustos Çarşamba

         K U R T A R                   label
         4  7  2  9                    code, 44pt, +6 tracking
─────────────────────────────────────
  1 × Fırından Sürpriz Paket
  Ödendi 69₺ · #A8213
  ⟳ 24 sn sonra kapanır
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         TESLİM ALDIM            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Why the shop name is the largest element:** staff verify "this is *us*" first, always. Both other directions buried it.

**Why a four-digit speakable numeric code and not an alphanumeric or a QR:** half these shops are a fırın counter with flour on the phone. A code you can *say* survives a cracked screen, a dead camera and a dark corner. The digits are keyable into the merchant tablet.

**Liveness — three proofs, and one of them is trainable.**
1. **The clock**, 56pt tabular, seconds swapping on a **hard 1Hz tick, never tweened.** A tweened clock looks rendered; a hard tick looks like a clock.
2. **The nabız** — a 3pt ivory bar sweeping the full width of the sign once per second, in phase with the seconds digit, easing out at the right edge. **This is the trained tell**, and it is trained *operationally*, not in the app: the merchant's printed counter card says *"Tarama çubuğu akmıyorsa ekran görüntüsüdür."* A busy stranger verifies a **movement** at a metre far faster than they compare two timestamps. This is Kıvrım's best idea, grafted — but it *supplements* the big clock rather than replacing it.
3. **The 30-second window.** The ring empties and the shutter rolls **back down** (400ms, no haptics). Re-swipe as many times as needed. **It is never one-shot.** Nothing is more hostile than a redeem screen you can accidentally burn — which is precisely the failure Kıvrım's un-re-tearable bag ships.

**Handover — this is where Son Işık's flood belongs.** It cannot be at the roll, where it would compete with the code. When `TESLİM ALDIM` is tapped (or the merchant tablet keys the code — whichever comes first), the entire screen floods `#FFC864 → #FFF1DC` for 2.5s: the phone becomes a lamp, visible from across a shop, unmistakable to a baker who has served forty people. Haptics: light–light–heavy, the shutter hitting its stop. Centred in the flood: `TESLİM ALINDI`, the frozen `18:34:11`, the shop and package name. Then it settles into the order ticket with the impact line: `Kadıköy'de 13. kepenk`.

**No sound by default.** A bakery at 19:00 is loud and a phone chime is embarrassing. One optional kepenk clatter in settings.

**Guards.**
- Outside the window: the shutter carries a drawn padlock, the swipe rubber-bands with a stiff resistance curve, and the pill reads `18:30'da açılır` / `21:00'de kapandı`.
- Under 10 minutes remaining: the header reads `kepenk 8 dk sonra iniyor` in tente-on-dark.
- **60-second undo** — `yanlışlıkla açtım` — because a thumb slips in a queue. The server marks the order `gösterildi` at first open and `teslim` at confirmation; the undo reverts to `gösterildi`.

**Accessibility.** The swipe target is 358 × 64. Under VoiceOver/TalkBack it is replaced by a plain `KEPENGİ KALDIR — kodu göster` button (`accessibilityRole="button"`) — a gesture is never the only path. There is also a persistent `Kaldıramıyor musun?` text button after two failed drags. The open state is one live region announcing shop, then the code **digit by digit**, then the item. The clock is announced only on request, never as a polite live region every second.

**Reduced motion.** No roll. The press-and-hold substitute (600ms, filling handle) keeps all haptics. The nabız is replaced by a **discrete state change** — Kıvrım's best accessibility idea — the sodium ring around the clock advancing **one 6° notch per second**. A state change, not an animation, still unmistakably alive at a metre. The clock keeps ticking in every mode: **it is proof, not decoration, and is exempt from reduced motion.**

### 4.6 SİPARİŞLER — orders

Two sections, pre-uppercased: `AKTİF` and `GEÇMİŞ`. Rows are 88pt: a 4pt tente strip down the left edge (the shop's hashed identity, so the list is scannable by colour), shop name `title`, package `data`, and on the right either a live time pill or a `KURTARILDI` mark — **ivory Archivo Black 12 on a sodium fill, rotated −3°**, not a green stamp, because there is no green in this app.

Active rows carry a 44pt `KEPENGİ AÇ` button inline. Tapping a past row shows the ticket: `kod 4729 · 69₺ · 18:34:11` in `data.lg`.

### 4.7 PROFİL / ETKİ — impact

**"SENİN SOKAĞIN."** A horizontally scrolling street elevation: every rescue you have made adds a 26pt-wide storefront — its own hashed awning stripe, its shutter **up**, its window lit. Shops you have rescued from more than once are drawn taller and brighter. Scroll left through your street; the far end is where you started. One `<Svg>` per month, no per-shop nodes beyond a rect and a stripe.

This deliberately replaces the seven-column lit-square grid, which is the GitHub contribution graph in a costume and was correctly called out as such. A street is on-thesis, it uses identity marks the app already generates, and it is the only impact visualisation in the set that a user would screenshot.

```
SENİN SOKAĞIN                        Ağustos 2026
▐▓▌▐▓▌  ▐▓▌▐▓▌▐▓▌   ▐▓▌ ▐▓▌▐▓▌▐▓▌ ▐▓▌  →

14 paket        8,4 kg yemek        1.870₺
kurtardın       çöpe gitmedi        kazandın

En sık kurtardığın saat   19:20
En çok gittiğin dükkân    Moda Fırın · 5 kez
```

All figures in `data.lg` mono, sodium. Below: bildirimler, ödeme yöntemleri, dil, hakkında.

### 4.8 Empty / loading / error

**LOADING — this is the most important of the three.** No skeleton shimmer, ever. The loading state is a list of cards with **fully closed shutters and dark tabelas** — literally the street before opening. As each shop's data arrives, its shutter rolls to its true height (220ms, 40ms stagger). Loading is not a lie about layout; it is the truest frame of the metaphor, and cold start feels like arrival rather than delay. It also deletes the single most reliably janky RN component: masked-view + animated gradient shimmer is expensive on Android and always looks cheap.

Caption: `Kepenkler kalkıyor…`

**EMPTY (night):** a row of fully closed shutters and one line —
`Bu civarda kepenkler indi. Yarın 17:00'den itibaren ışıklar yeniden yanar.`
plus a countdown to tomorrow and a `Haber ver` bell.

**EMPTY (day, Gündüz palette):** `Henüz erken. İlk paketler 17:00 civarı çıkar.` with the same bell.

**EMPTY (filtered):** `Bu filtreyle açık kepenk yok.` + `Filtreleri temizle`.

**ERROR:** a half-lowered shutter with a paper note taped across it at 2°, mono type: `Bağlantı yok — tekrar dene`. The paper is the only place in the app anything is rotated, and it is a single non-text-bearing SVG group.

**LOCATION DENIED:** `Konumun kapalı. Kadıköy'ü gösteriyoruz.` + `Konumu aç` — never a blocking wall.

---

## 5. What NOT to do

These are the specific temptations a developer will feel, and each one wrecks the direction.

1. **Do not add a `box-shadow` or an `elevation` to the offer card.** It will look flat in the simulator next to the Figma and you will want to. Depth here is painted: the top hairline, the bottom contact edge, the light-spill gradient. Adding a shadow makes iOS and Android diverge and turns a storefront back into a floating white tile.
2. **Do not raise the card radius above 4.** 12 or 16 will feel "more polished" for exactly one day. It is the fastest possible route back to the build the client already rejected.
3. **Do not render slats as individual `<Rect>`s** because a `<Pattern>` was fiddly to get right. One is a draw call, the other is 300 nodes in a scroll view.
4. **Do not animate the shutter's `height` or `y`.** Only `translateY` on a clipped group. And do not let it creep continuously — it snaps every 60 seconds.
5. **Do not put brand type inside `react-native-svg` `<Text>`.** Android resolves it through a separate Typeface lookup, silently falls back to Roboto, and your Turkish diacritics go with it. Real RN `<Text>` over SVG, always.
6. **Do not call `.toUpperCase()` or set `textTransform: 'uppercase'`.** Ever. `trUpper()` for dynamic strings, pre-uppercased keys in `tr.json` for everything else.
7. **Do not use `'transparent'` as a gradient end stop.** `rgba(R,G,B,0)` or you get a grey smudge on Android.
8. **Do not introduce a fabricated struck-through original price** because the discount "reads stronger." The value range plus `×N değer` is both more honest and a better comparator.
9. **Do not add green.** Not for the success state, not for the impact numbers, not for the KURTARILDI stamp. Rescue is expressed as light. Every competitor is green; that is the point.
10. **Do not add confetti, a success checkmark, a Lottie, a shimmer, a parallax header, a press scale, or an animated price counter.** Money and time never move. The entire micro-interaction budget is `activeOpacity: 0.85`, and the entire effects budget is spent once, on the redeem roll.
11. **Do not make the redeem one-shot,** and do not remove the 60-second undo. Do not require the gesture — the plain button path is not optional.
12. **Do not resize the `MapView` on scroll.** Animate its container's height; keep the map at a constant size and translate it. And do not leave `tracksViewChanges` true.
13. **Do not let the shutter cover the tabela** when a designer asks for "more drama." The cap is 0.78 and the sign lives below the band.
14. **Do not tilt the cards.** It kills Android text antialiasing and the price column simultaneously.
15. **Do not fetch a shop logo or a stock photo, "just as a fallback."** There is no photography. The hashed tente and the category glyph *are* the identity system, and the moment one card has an image the whole system reads as broken.

---

## 6. Build order

**Phase 0 — foundation (1 dev, blocks everything, ~2 days).**
Fonts installed and CI glyph-coverage test green. `tokens.ts` with all three phase objects frozen at module scope. `ThemeProvider` + `faz()` with unit tests at fixed timestamps. `trUpper()` + `tr.json` with pre-uppercased keys. `ClockProvider` exposing `minuteBucket` (60s) and an opt-in `secondTick` (1Hz, mounted only by redeem). `useReduceMotion()` subscribed. Contrast assertions as a Jest test over the token pairs.

**Phase 1 — the signature, reviewable on day 3.**
`<Kepenk/>` + `<Tente/>` + `<Tabela/>` + `<ZamanHapi/>` + `<DegerCubugu/>`, assembled into `<VitrinKarti/>`, on a Storybook screen showing the four real offers at six simulated times (3sa / 90dk / 56dk / 20dk / açılmadı / tükendi) in all three palette phases. **This is the review gate.** If the card is not right here, nothing downstream matters, and this screen is where the client sees whether "primitive" has been answered.

**Phase 2 — parallelisable, three tracks, no shared state beyond Phase 1:**

- **Track A — Keşif + Harita.** FlashList, street spine, collapsing map header, filter chips, empty/loading/error states. The heaviest track; give it the strongest dev, and force `PROVIDER_GOOGLE` + API keys on day one of the track, not at the end.
- **Track B — Detay → Satın alma → Kepenk (redeem).** The money and ritual path. Redeem is the highest-risk screen and should be device-tested on a physical mid-range Android *and* an iPhone from the first working build, because the haptic split and the brightness/auto-lock behaviour cannot be evaluated in a simulator.
- **Track C — Siparişler + Profil/Etki + settings.** The lightest track; it reuses the tente hash and the ticket layout and touches nothing the other two need.

**Phase 3 — integration and hardening.** Reduced-motion pass across all screens. VoiceOver/TalkBack pass, especially the redeem button substitution and digit-by-digit code announcement. Dynamic-type pass at 1.3× and 1.6×. Slow-Android pass (`deviceYearClass` degradations, FlashList blank-cell measurement, marker snapshot audit). Day/night phase QA at six fixed timestamps across December and June — the phase function is pure, so this is six unit tests plus six screenshots, not a time-travel exercise.

**What can start before Phase 1 lands:** the tab bar, navigation skeleton, auth/session, API client, and the `tr.json` copy deck. What cannot: anything that renders an offer.