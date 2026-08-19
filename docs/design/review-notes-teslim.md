# Review notes — the money path and the kepenk (Track B, first pass)

Reviewed by opening the 11 captured frames at 390pt and comparing them against
`docs/design/consumer-app-spec.md` §4.3–§4.5.

## Verified good — do not rework

- **Closed redeem state is the anti-screenshot proof it should be.** A screenshot
  captures a shut shutter and no code.
- **Open state is ordered by the staff member's task**, with the shop sign the
  largest element. Staff verify "this is *us*" first.
- **Liveness reads instantly** — the running clock plus the date.
- **The code is spaced so it can be read aloud** (`S J P 4`), which is the point
  of choosing a speakable code over a QR.
- `yanlışlıkla açtım` is the right affordance beside a gesture that otherwise
  feels irreversible.
- `Kendi çantanı getir` on the confirmation is good copy.
- The `mszu6b78` suffix visible in the frames was checked against the live API
  and is the test script's throwaway offer, **not** a leak into the UI.

## To fix

### 1. The opened shop is a void — this is the priority

On both frames where the shutter goes up (`07-satin-alma-onayi`,
`10-kepenk-acik`) the area the shutter vacated is flat, dead ground.

These are the only two places in the whole app where the kepenk inverts, and
the spec's emotional arc is "everything is closing, and you made one thing
open". Right now the payoff of that inversion is a grey rectangle.

Compare against what the offer card does after its light fix: a narrowing gap
reads *hotter*, and the light falls onto the metal and the sign. An opened shop
should read as **an interior with light in it** — you are looking into a shop
that is open for you — not as the absence of a shutter.

This is the same defect class already sent back once on the card: the light is
specified as the payoff and is not lighting.

Note §4.5's handover flood is a separate, later moment. This is about the state
*before* `TESLİM ALDIM` is pressed.

### 2. Large vertical dead zones

On the confirmation the top ~40% is empty above the sign; on the open redeem
state there is a long gap between `29 sn sonra kapanır` and the button.

Some breathing room is right — the action belongs in thumb reach and the code
must not be crowded — but both currently read as under-filled rather than
composed. Once the interior is lit this may resolve itself, because that space
stops being empty and becomes the shop. Re-judge after fixing 1 rather than
padding it with content.

## Verification gap

Every frame was captured at 11:35, i.e. only in the **gündüz** palette. This is
an app whose one hour of relevance is after sunset, so **gece** is the primary
case and it has not been seen at all. Any re-review must include night frames.
