# Review notes — Siparişler and Profil/Etki (Track C, first pass)

Reviewed by opening the captured frames at 390pt against
`docs/design/consumer-app-spec.md` §4.6 and §4.7.

## Verified good — do not rework

- **The impact copy is right.** `2,5 kg yemek · çöpe gitmedi` says the thing in
  the user's own terms instead of reciting CO2e jargon, and `141₺ kazandın` is
  the number a price-conscious user actually came for.
- `En sık kurtardığın saat · 19:15` and `En çok gittiğin dükkân` are good
  personal details that cost nothing and make the screen feel observed.
- Keeping the menu to items that really exist (bildirim / şikayet / yasal)
  instead of the spec's mockup list is the correct call.
- The street took several iterations and the agent's own diagnosis — that the
  first render "read as a bar chart with coloured caps" — was accurate and
  honestly reported.

**The `₺ renders as Ł` report is a false alarm.** Verified: the fonts contain
U+20BA, `Intl.NumberFormat("tr-TR")` emits U+20BA, and a 120px render shows a
correct lira sign next to a visibly different `Ł`. At 9–13pt the two strokes
merge, which is what made it look wrong in a screenshot. No fix needed — do not
"correct" this into a real bug.

## To fix

### The street's first state is the one every user sees, and it is not designed

With the seeded consumer's single rescue, `SENİN SOKAĞIN` renders as one 26pt
box alone under a month label. It reads as a stray element or a rendering
glitch, not as a street.

This is not an edge case: **every user passes through one rescue**, and it is
the moment the reward loop has to start working — the first storefront should
feel like the beginning of a street, not an orphan. The full-street render
(verified separately in the `/sokak-inceleme` harness with 17 rescues) is fine;
it is the near-empty state that needs design.

The obvious move is to give the street somewhere to go: unlit, un-rescued
frontages ahead of the one you have lit, so a single rescue reads as the first
lit shop on a street that continues. Whatever is chosen, judge it at **0, 1, 2
and 3 rescues**, not only at 17.

## Verification gap

The captured frames are day-palette. **Gece** is this app's primary case — the
street in particular is described in terms of lit windows, which only mean
something against a dark ground. Re-capture the profile and the street at 0/1/2
rescues in both palettes.
