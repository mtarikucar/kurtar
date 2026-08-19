# Review notes — Keşfet and Harita (Track A, first pass)

Reviewed by opening the captured frames at 390pt against
`docs/design/consumer-app-spec.md` §4.1, §4.2 and §4.8.

## Verified good — do not rework

- **The loading state is right.** A street of closed shutters with dark tabelas
  is what §4.8 asked for and is far better than any shimmer skeleton.
- **The map degrades honestly on web** with an explanation, rather than
  rendering a blank hole or crashing.
- **The street spine and district sections exist and read.**
- **Three real-backend findings** that a mock would never have surfaced: the
  `pageSize` cap, the wrong Turkish accusative (`Kadıköy'yi` → `Kadıköy'ü`), and
  the `açık` count silently including not-yet-opened shops.

Two deviations are accepted and should be recorded in the build log so the next
person does not "fix" them: grouping sections by `district` because the API has
no finer field, and refusing to fabricate a ferry-time estimate.

## To fix

### 1. The spine contradicts itself

§4.1 says the street spine means "scrolling down is walking away from where you
stand". In `02-kesif-liste` the column reads **1,3 km, then 399 m** — walking
away, then back. The spine is the one element in the design built for someone
deciding *while walking*, and right now its axis carries no meaning; it is two
numbers in a column.

This collides with the spec's other instruction — sort by closing time within
distance tiers — and the collision has to be resolved rather than letting the
spine lose. Either the tiers are real and visible (distance ascends *between*
tiers, time orders *within* one), or the spine is not carrying distance. Pick
one, make it true, and record which and why.

### 2. Real content is being clipped

The card was narrowed from 358pt to 291pt to fit the spine, and it no longer
fits its own content: `1,3 km…`, `280-380₺ değerin…`, `5 …`. At full width on
`/vitrin` the same lines fit.

A value band that truncates has stopped doing its job — the struck range is half
of how a user judges the deal — and a truncated distance is worse on the screen
designed for walking. The spine costs about 60pt; find that budget somewhere
other than the card's content, or give the spine a narrower treatment. **Do not
shrink the type below the scale to solve it.**

### 3. Loading and loaded are different layouts

Loading cards are full-width with no spine; loaded cards are 291pt with one, so
the list reflows the moment data lands. That undoes the point of §4.8's loading
state, which is that it is "the truest frame of the metaphor" rather than a lie
about layout — precisely what it was written to avoid. The closed-shutter street
should sit in the same geometry the open one will.

## Verification gap

Every frame was captured at 11:30, i.e. only the **gündüz** palette. This app's
one hour of relevance is after sunset, so **gece is the primary case and it has
not been seen.** Any re-review must include night frames of the list, the
loading state and the empty state.
