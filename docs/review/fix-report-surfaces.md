# Frontend surface fix round — report

Scope: every IMPORTANT and MINOR finding in
[`open-findings.md`](open-findings.md) that lives in `apps/merchant-web`,
`apps/admin-web`, `apps/consumer`, `landing`, `packages/api-client`, or
`packages/ui-tokens` — nothing under `backend/` was touched (a sibling
agent owned that surface in the main checkout at the same time).

Worktree: `/home/tarik/Projects/kurtar-worktrees/fix-ui-surfaces`, branch
`fix/ui-surface-findings`, based on `main` at `a7c5935`. 13 commits, clean
working tree, nothing left uncommitted.

**Result: 15 of 16 in-scope findings closed** (I9's backend half and one
sub-item of M16 are named as blocked below — both genuinely need a
backend change, so they were reported rather than faked). I14 (M4 IBAN
audit trail) is **fully blocked**: both of its fix-sketch edits are
backend-only files.

| # | Finding | Disposition |
|---|---|---|
| I6 | Logout never unregisters the push token | **Fixed** — `unregisterPushToken()` called before token teardown |
| I7 | `POST /me/location` has no caller | **Fixed** — wired into `useEffectiveLocation`, throttled 15 min |
| I8 | Consumer can file a complaint but never read it | **Fixed** — new `complaints/index.tsx` + `complaints/[id].tsx` |
| I9 | Redeem screen shows no pickup window; rejection is one vague sentence | **Fixed (frontend half)** — window always shown, two of four rejection reasons pre-empted client-side. Backend DTO/error-code split reported as blocked. |
| I10 | SLA countdowns frozen at fetch time | **Fixed** — `refetchInterval: 60_000` on both queues |
| I11 | STT checkbox names a document that doesn't exist | **Fixed** — real copy, real links, real version label |
| I14 | Full IBAN/taxId exposed with no audit trail | **Blocked — backend only**, see below |
| M4 | Share-link deep link has nowhere to land | **Fixed** — `apps/consumer/src/app/o/[id].tsx` + `+not-found.tsx` + real Android package |
| M5 | Pickup countdown prints mm:ss for a pickup hours away | **Fixed** — `formatRemaining` (min → h+min → d+h) |
| M6/M7 | Two collapsed-error-code cases render a confident false reason | **Fixed** — copy states the outcome, not an invented cause |
| M8 | Breached-SLA badge is the only urgency state with no border | **Fixed** — added `danger-900` token + cross-cutting CSS-var guard |
| M9 | Three surfaces, three timezone policies | **Fixed** — `Europe/Istanbul` pinned in admin-web + consumer |
| M9(orig) | merchant-web pickup list references undefined CSS vars | **Fixed** — same cross-cutting guard catches this too |
| M10(orig) | "Manuel teslim" asks for a value the merchant never sees | **Fixed** — deleted the id-only fallback form |
| M10 | landing double-casts through a stale-premise hand-written shape | **Fixed** — cast deleted, real type flows through |
| M11(orig) | Every deadline badge is its own aria-live region | **Fixed** — opt-in `live` prop, on only for the two standalone usages |
| M12(orig) | Hardcoded Turkish strings outside i18n in consumer | **Fixed** — 4 strings moved into i18n, proven via locale switch |
| M13(orig) | Pickup time reconstructed from an untethered mirrored constant | **Fixed (stopgap)** — cross-workspace test reads the real backend constant |
| M16(orig) | Dead client methods, inert toggle, invisible invoice status | **Fixed (3 of 4 sub-items)** — dashboard tile sub-item blocked, see below |
| M17(orig) | 261-line hand-mirrored response-type file on a stale premise | **Fixed** — replaced with `Awaited<ReturnType<...>>` projections |
| M18(orig) | `RequestOptions.signal` unreachable from any domain method | **Fixed** — exposed on 5 read-heavy methods, forwarded to `fetch()` |

Verification is at the bottom: lint + typecheck + full test suite + a
production build, run per workspace, all green, after every fix.

---

## I6 — logout now unregisters the push token

**What was wrong.** `auth-context.tsx`'s `logout()` cleared local tokens
only — the backend push-token row stayed bound to the outgoing user, so a
signed-out device kept receiving the previous user's transactional
notifications (reservation confirmations, the pickup reminder with the
redeem code in plain text) until some other device happened to register
the same Expo token.

**Fix.** `apps/consumer/src/lib/push.ts` now caches the token from the
last successful `registerPushTokenIfPermitted()` call in module state and
exposes `unregisterPushToken()` (best-effort, never throws — calls
`client.account.pushTokens.remove(token)`). `auth-context.tsx`'s
`logout()` calls it **before** `client.auth.logout()`, since the DELETE
needs a still-valid bearer token.

**Test.** `apps/consumer/src/__tests__/auth-logout-push.test.tsx` (3
cases: no-token no-op, real unregister call, unregister-failure still
completes local sign-out).

**Revert-proof.** With the fix reverted, `pushTokens.remove` is called 0
times instead of once:
```
Expected: "ExponentPushToken[abc123]"
Number of calls: 0
```

---

## I7 — device location now reaches `POST /me/location`

**What was wrong.** `client.account.updateLocation` was defined but never
called anywhere — `lastLat`/`lastLng` stayed `NULL` for every user
forever, so `offer-published-fanout`'s `ST_DWithin` filter excluded
everyone and the OFFER_NEARBY push could never fire, even though the
consumer-facing "offers near you" toggle was fully wired and shipped.

**Fix.** `apps/consumer/src/hooks/use-effective-location.ts` — after a
GPS fix resolves, fire-and-forget `POST /me/location`, throttled to once
per 15 minutes via `AsyncStorage` so Discover and Search (both use this
hook) mounting together don't double-post. Never throws.

**Test.** `apps/consumer/src/__tests__/use-effective-location.test.tsx`
(4 cases: posts on grant, no post when denied, throttled on a second
mount, never throws on POST failure).

**Revert-proof.** All 3 behavioral assertions fail without the fix
(`mockUpdateLocation` never called).

---

## I8 — consumers can now read their own complaints

**What was wrong.** `GET /complaints/mine` and `GET /complaints/{id}` had
zero callers — a consumer could file a complaint (`complaint/new.tsx`)
but had no screen to ever see it again, so the ETAHS 15-day clock was
answered into a void from their side.

**Fix.**
- `apps/consumer/src/hooks/use-complaints.ts` — added `useMyComplaints`,
  `useComplaint(id)`, `useAddComplaintMessage(id)`.
- `apps/consumer/src/components/ComplaintRow.tsx` — new list-row
  component.
- `apps/consumer/src/app/complaints/index.tsx` — list screen.
- `apps/consumer/src/app/complaints/[id].tsx` — thread + reply screen.
- Registered in `_layout.tsx`; a "Şikayetlerim" row added to the profile
  screen next to the existing "file a complaint" entry.

**Test.** `apps/consumer/src/__tests__/complaints-screens.test.tsx` (5
cases: list renders from `listMine`, empty state, navigation to detail,
thread renders the merchant/admin reply, reply POSTs via `addMessage`).

**Revert-proof.** N/A in the traditional sense — the screens didn't exist
before; the test file's imports alone would fail to resolve on revert.
Confirmed by construction (git shows these as new files).

---

## I9 — redeem screen: pickup window shown, two of four rejection reasons pre-empted

**What was wrong.** The redeem screen never showed the pickup window it
judges the swipe against, and every rejection collapsed into
`RESERVATION_NOT_REDEEMABLE` — one vague sentence — regardless of the
real reason.

**Investigation before fixing:** the backend's `notRedeemableError()`
(`reservations.service.ts`) collapses "too early" and "too late" into
that single code by construction (`now < pickupStartAt || now >
pickupEndAt`, one check). Splitting that is a genuine backend change
(new error codes + `pickupStartAt`/`pickupEndAt` on `ReservationDto`) —
**out of scope, not attempted**. But the other two rejection reasons the
finding names turned out to already be handled correctly on the backend:
"already redeemed" is an **idempotent success** (`reservations.service.ts`
returns `{status: "REDEEMED"}` again, not an error), and "not yours" is
already a **distinct 403 `FORBIDDEN`**, separate from the redeemability
check. So the only real gap fixable from this side is the two
pickup-window cases.

**Fix.** `apps/consumer/src/app/redeem/[id].tsx`:
- Always renders the pickup window (`formatPickupWindow`/`formatClockTime`)
  under the live clock, using `pickupStartAt`/`pickupEndAt` already
  available on `useOrderDetails`'s return (via the purchase-cache
  snapshot or the live same-day store lookup — no backend change needed).
- **Too early**: replaces `SwipeToConfirm` with a disabled banner stating
  the exact start time (`redeem.notStartedYet`), computed client-side
  against the same window, ticking live via a 1s `now` state so it
  unlocks itself the instant the window opens — the swipe is never even
  attempted for this reason.
- **Too late**: when `pickupEndAt` is known and has passed, falls through
  to the existing `notRedeemable` empty state before the swipe is ever
  offered, instead of letting a doomed swipe fail server-side.

**Test.** `apps/consumer/src/__tests__/redeem-screen-window.test.tsx` (4
cases: window shown + swipe offered when open; disabled banner with the
specific start time when not-yet-open; live unlock via fake timers once
the clock crosses the start; falls through to the empty state once the
window has closed).

**Revert-proof.** All 4 tests fail on revert — the DOM dump shows the
swipe control offered with no window text and no gating.

**Remaining (blocked, backend):** the true fix for "too early"/"too
late" as *distinct server-reported reasons* — split
`RESERVATION_NOT_REDEEMABLE` into `RESERVATION_PICKUP_NOT_STARTED` /
`RESERVATION_PICKUP_WINDOW_PASSED`, and add `pickupStartAt`/`pickupEndAt`
to `ReservationDto` so a reinstalled device (no local snapshot) gets the
real window instead of the derived one. Not attempted — genuinely needs
`backend/`.

---

## I10 — SLA countdowns re-sync instead of freezing

**What was wrong.** `useComplaintsList` and `useReportsList` had no
`refetchInterval` — the server-computed `slaCountdownMs` /
`takedownCountdownMs` badges (and the `AT_RISK` filter) froze at
whatever the server said when the tab was opened, always drifting in the
unsafe direction on an always-open ops console.

**Fix.** New `apps/admin-web/src/lib/queryConfig.ts` exports
`DEADLINE_REFRESH_INTERVAL_MS = 60_000` (lifted from
`useDashboardData.ts`, which already used this cadence). Added to both
queries' options.

**Test.** New `useComplaints.spec.tsx` / `useReports.spec.tsx` (fake
timers, assert the query re-fires at 60s/120s, not just once at mount).

**Revert-proof.**
```
expected "spy" to be called 2 times, but got 1 times
```

---

## I11 — STT checkbox now names the real document

**What was wrong.** The STT checkbox cited "Satış Sözleşmesi ve Teslim
Taahhüdü" — a document that does not exist anywhere in the repo. Neither
attestation checkbox linked to the real, published Aracılık Sözleşmesi a
merchant is legally attesting to, and the recorded contract version
(`"2026-08"`) was an unrelated hand-typed string vs. the document's own
`"v0.1 — 15 Ağustos 2026"`.

**Fix.** `apps/merchant-web/src/onboarding/OnboardingPage.tsx`:
- STT checkbox rewritten in the agreement's own words, citing Madde 3.
- Both checkboxes now use `<Trans>` with a real `<a target="_blank">` to
  `${VITE_LANDING_URL}/tr/yasal/aracilik-sozlesmesi` (new
  `shared/externalLinks.ts` + `VITE_LANDING_URL` env var, defaulted to
  landing's fixed dev port).
- `CONTRACT_VERSION` now literally `"v0.1 — 15 Ağustos 2026"`, sourced
  from the document's own `versionLabel.tr`.

**Test.** `apps/merchant-web/src/onboarding/OnboardingPage.test.tsx` (3
cases: STT text no longer cites the fake document; both checkboxes link
to the real doc with `target="_blank"`; contract version matches the
document's label, not the old string).

**Revert-proof.** All 3 fail on revert (DOM dump shows the old fake
document name, no `<a>` elements, `"2026-08"`).

---

## I14 — BLOCKED, backend only

Both of the finding's fix-sketch edits are backend files:

1. "Two-line fix on the export: in `AdminExportsController`'s
   `merchants.csv` handler, write an `AuditLog` row" —
   `backend/src/modules/admin/admin-exports.controller.ts` /
   `admin-exports.service.ts`.
2. "Drop `iban`/`legalName` from `SettlementsService.adminGet`'s merchant
   select" — `backend/src/modules/settlements/settlements.service.ts`.

There is no frontend-side mitigation that closes the actual gap (a bulk
PII/bank-detail export with no forensic trace) — the admin-web CSV
download button and the settlement detail read are both correctly
consuming what the backend already sends. **Not attempted.** Handing
back to whoever owns `backend/`.

---

## M4 — the share-link deep link now has somewhere to land

**What was wrong.** `landing`'s `/o/[id]` bridge page builds
`kurtar://o/<id>` and an Android `intent://o/<id>` — but
`apps/consumer/src/app/` had no `o/` route at all, and
`landing/lib/site-config.ts`'s `androidPackageName` was
`"app.kurtar.consumer.PLACEHOLDER"`, which can never match the app's
real declared package (`app.json`'s `"app.kurtar.consumer"`), so even a
correctly-routed intent could never find the installed app.

**Fix.**
- `apps/consumer/src/app/o/[id].tsx` — **not** a bare redirect (the
  sketch's suggestion): `offer/[id].tsx` requires both an offer id *and*
  a `storeId` (its own `useStoreProfile(storeId)` call), and a share link
  only ever carries the offer id. This screen resolves the storeId first
  via the same public `GET /discovery/offers/{id}` landing's bridge page
  itself already uses, then `router.replace`s into the real offer screen
  with both params. Falls back to a branded not-found state on failure.
- `apps/consumer/src/app/+not-found.tsx` — didn't exist; added a branded
  catch-all.
- `landing/lib/site-config.ts` — `androidPackageName` fixed to the real
  package; the Play Store *listing* URL stays a placeholder (no store
  listing exists yet — that's a different, correctly-still-open gap).

**Test.** `share-link-offer-screen.test.tsx` (resolves storeId + redirects
with both params; shows not-found on failure, never a blank screen),
`not-found-screen.test.tsx`, `landing/test/offer-app-opener.test.ts`
(the Android `intent://` `package=` param is the real package, not
`.PLACEHOLDER`).

**Revert-proof.** `offer-app-opener.test.ts` fails on revert:
```
expected 'intent://o/offer-1#Intent;scheme=kurt…' to contain 'package=app.kurtar.consumer;'
Received: "...package=app.kurtar.consumer.PLACEHOLDER;..."
```

---

## M5 — pickup countdown no longer overflows mm:ss

**What was wrong.** `formatCountdown` had no hour rollover — a pickup
hours away rendered e.g. `"Teslim alma: 18:30 · 420:00"`.

**Fix.** `apps/consumer/src/lib/format.ts` — new `formatRemaining`
(`<1h` → minutes; `<24h` → hours+minutes, dropping a redundant `" 0 dk"`
tail; `>=24h` → days+hours). `PickupCountdown.tsx` uses it instead of the
deleted `formatCountdown`.

**Test.** Extended `format.test.ts` (sub-hour, sub-day, multi-day,
negative/zero floor).

**Revert-proof.** `formatRemaining is not a function` on revert (the
function was net-new, replacing the deleted one).

---

## M6 / M7 — two collapsed-error-code cases no longer assert a false cause

**What was wrong.** `OFFER_UNAVAILABLE` and the payment-failed screen's
`EXPIRED` branch are both intentionally collapsed, opaque codes on the
backend (documented, not a bug) — but the consumer rendered confident,
specific, and sometimes **false** causes ("Bu paket az önce tükendi —
başka biri senden önce davrandı" / "Ödemen onaylanmadı ya da iptal
edildi") when the real cause could just as easily be a merchant/admin
pulling the offer mid-flow.

**Fix.** Copy-only, both `tr.json`/`en.json`: state the *outcome*
("Bu paket artık alınamıyor" / "Rezervasyonun tamamlanmadı: ödemen
onaylanmadı ya da paket artık mevcut değil"), never invent a cause the
backend deliberately doesn't disclose.

**Test.** M6 is covered by the existing `purchase-screen.test.tsx`
(updated to assert the new copy — this is real regression coverage since
that test drives the actual `OFFER_UNAVAILABLE` catch branch). M7 is
copy-only with no existing behavioral test to update; not a behavior
change, so no new test was added for it specifically — the risk is
purely a UX-microcopy accuracy question, not a code path.

---

## M8 — breached-SLA badge border restored, cross-cutting guard added

**What was wrong.** `DeadlineBadge.module.css`'s `.breached` rule
referenced `var(--color-danger-900)`, a step `semantic.danger` never
defined (`packages/ui-tokens/src/colors.ts` only had 50/500/700) — an
unresolved `var()` in a border shorthand silently falls back to
`border-style: none` at computed-value time, so breached was the only
urgency state rendering no border.

**Fix.**
- `packages/ui-tokens/src/colors.ts` — added a `900` step to
  `semantic.danger` (`#5C1414`) — deliberately **not** reusing
  `danger-700` (the fill color) as the border, since that would give zero
  contrast and defeat the whole point of a border-as-signal.
- **Cross-cutting guard** (the part of the fix sketch actually worth the
  effort): new `apps/admin-web/src/test/tokenVars.spec.ts` and
  `apps/merchant-web/src/test/tokenVars.spec.ts` — each regexes every
  `var(--…)` out of every `*.module.css` file in its app and asserts the
  name is in the exact set that app's token-bridge (`injectDesignTokens`
  / `injectThemeVariables`) actually produces. This is the same
  enforcement `landing/test/palette-parity.test.ts` already had, now
  applied to admin-web and merchant-web's CSS modules — and it caught
  M9(orig)'s two undefined vars in the same pass (see below).

**Test.** `DeadlineBadge.spec.tsx` extended with an explicit `live`
describe block (see M11(orig) below); the two `tokenVars.spec.ts` files
are themselves the test.

**Revert-proof.**
```
undefined CSS custom properties in .../DeadlineBadge.module.css:
expected [ 'color-danger-900' ] to deeply equal []
```

---

## M9 — timezone pinned in the two surfaces that lacked it

**What was wrong.** `apps/admin-web/src/lib/date.ts` and
`apps/consumer/src/lib/format.ts` both formatted instants via
`Intl`'s `tr-TR` *locale* alone — a locale governs script/digit/calendar
conventions, never a timezone, so every render silently used the
viewer's device/OS zone instead of `Europe/Istanbul`. `apps/merchant-web`
already pinned this correctly.

**Fix.** `timeZone: "Europe/Istanbul"` added to every
`Intl.DateTimeFormat` / `toLocale*` call in both files.

**Test.**
- `apps/admin-web/src/lib/date.spec.ts` — constructs the module fresh
  under two different `process.env.TZ` values (`Europe/Istanbul` vs.
  `America/New_York`) via `vi.resetModules()` + dynamic `import()`, and
  asserts identical output for the same instant. Confirmed this
  technique is reliable in vitest/jsdom (verified against a real revert).
- `apps/consumer/src/__tests__/format.test.ts` — the equivalent
  `process.env.TZ` technique was tried first here and turned out to be
  **unreliable in this app's jest-expo/React-Native test environment**
  (both branches silently resolved to the same, wrong, un-pinned
  timezone, so the test passed even with the fix fully reverted — a
  false-negative revert-proof). Switched to spying on
  `Date.prototype.toLocaleTimeString`/`toLocaleDateString` and asserting
  the `timeZone` option was actually passed — deterministic regardless of
  the runtime's ICU/TZ-switching behavior.

**Revert-proof (admin-web, vitest):**
```
expected '15 Ağustos 2026 17:30' to be '16 Ağustos 2026 00:30'
```
**Revert-proof (consumer, jest, spy-based):**
```
Expected: "tr-TR", ObjectContaining {"timeZone": "Europe/Istanbul"}
Received: "tr-TR", {"hour": "2-digit", "minute": "2-digit"}
```

---

## M9(orig) — merchant-web's undefined CSS vars (caught by M8's new guard)

**What was wrong.** `apps/merchant-web/src/today/PickupListSection.module.css`
referenced `--color-border` and `--color-text-secondary` — neither ever
set by `theme.ts`'s `injectThemeVariables()`.

**Fix.** Swapped for the tokens every other module in the app already
uses for the same roles: `--color-neutral-200` (row border),
`--color-neutral-600` (secondary text).

**Revert-proof.** `merchant-web/src/test/tokenVars.spec.ts` (M8's new
guard) fails on revert:
```
undefined CSS custom properties in .../PickupListSection.module.css:
expected [ 'color-border', …(2) ] to deeply equal []
```

---

## M10(orig) — "Manuel teslim" id-only fallback deleted

**What was wrong.** The fallback form asked the merchant to type a
"Rezervasyon kimliği" (the reservation's internal id) — a value **no
surface in the app ever shows them** (only the 6-char code is rendered
anywhere). `GET /reservations/for-merchant` already returns every one of
today's reservations across every store, and the per-row "Teslim et"
button already covers all of them.

**Fix.** Deleted the form, its state, its i18n keys, and its now-dead
CSS classes from `apps/merchant-web/src/today/PickupListSection.tsx`.
Renamed the shared redeem hook `useManualRedeem` → `useRedeemReservation`
(it's now solely the per-row button's mutation).

**Test.** `PickupListSection.test.tsx` — replaced the old "manual
fallback works" test with one asserting the form and its label are
absent.

**Revert-proof.** Fails on revert (finds the reintroduced input/button).

---

## M10 — landing's stale double-cast deleted

**What was wrong.** `landing/lib/impact.ts` carried a 24-line comment and
an `as unknown as {...}` cast, citing a `SuccessBody<P,M>` bug that is
fixed (`packages/api-client/dist/domains/impact.d.ts` resolves a
concrete type now) — both other web surfaces (`merchant-web`,
`admin-web`) already completed this migration, citing commit `e5621a3`.

**Fix.** Deleted the cast and the stale comment;
`const totals = await client.impact.getPublic();` typechecks directly
against the generated schema.

**Test.** Existing `landing/test/impact.test.ts` (5 cases, unchanged) and
`impact-counter.test.tsx` (3 cases) both still pass unmodified — this is
a type-safety fix with zero runtime behavior change (the finding itself
notes the 3 field names already matched), so the "revert-proof" here is
that `npm run typecheck` stays clean and the existing suite's assertions
on the real field values are unaffected.

---

## M11(orig) — deadline badges are no longer ~20 simultaneous live regions

**What was wrong.** `DeadlineBadge.tsx` rendered `role="status"`
unconditionally — a queue table (5 list/table usages) stood up ~20
simultaneous polite live regions per page render.

**Fix.** New `live?: boolean` prop, defaulting to `false`; `role="status"`
only when `live` is true. Passed `live` from the two genuinely standalone
usages (`ComplaintDetailPage.tsx`, `SettlementDetailPage.tsx`'s due-date
badge) only.

**Test.** `DeadlineBadge.spec.tsx` — all 10 pre-existing cases updated to
pass `live` explicitly (they test the badge in isolation, where
`role="status"` is still a legitimate, tested capability); 2 new cases
added specifically for the M11 behavior (not-a-live-region by default,
is-one when `live` is passed).

**Revert-proof.** Verified via the two new cases, which assert
`queryByRole("status")` is null by default / present with `live`.

---

## M12(orig) — four hardcoded Turkish strings moved into i18n

**What was wrong.** `SwipeToConfirm`'s `accessibilityHint`,
`LiveClock`'s `accessibilityLabel`, the purchase quantity stepper's
`+`/`-` `accessibilityLabel`s, and `use-order-details.ts`'s last-resort
`"Mağaza"` store-name fallback were all hardcoded Turkish literals — the
one gap in an app that otherwise has exact tr/en key parity.

**Fix.** All four moved into `tr.json`/`en.json`, read via `t(...)`.

**Test.** Since the default-locale rendered text is byte-identical
before and after (only its *source* moved), a plain render-and-assert
test can't distinguish "i18n-sourced" from "hardcoded to the same
string" — that would pass even fully reverted. Proved the only way that
actually can: switch `i18n.changeLanguage("en")` and assert the
accessible text follows. Four new/extended test files:
`accessibility-i18n.test.tsx` (SwipeToConfirm, LiveClock),
`purchase-screen.test.tsx` (quantity stepper),
`use-order-details-i18n.test.tsx` (store-name fallback).

**Revert-proof.** All fail on revert — reverted DOM dump shows Turkish
text even under `i18n.changeLanguage("en")`.

*(Implementation note: `render()`/`unmount()` from
`@testing-library/react-native` v14 must both be `await`ed in this
codebase — an un-awaited `unmount()` across two renders in the same test
left a stale i18n subscription that corrupted a *later*, unrelated
test's query scope. Not a finding, just a debugging note in case another
agent hits the same "test passes alone, fails in the full file" symptom.)*

---

## M13(orig) — pickup-time constant now guarded against drift

**What was wrong.** `CANCEL_DEADLINE_BEFORE_PICKUP_MS` (2h) hand-mirrors
`reservations.service.ts`'s own constant with nothing tying the two
together. The real fix — adding `pickupStartAt`/`pickupEndAt` to
`ReservationDto` — is a backend change; confirmed still absent as of this
round (`ReservationDto` still has neither field; only
`ReservationForMerchantItemDto` does). **Not attempted** — out of scope.

**Fix (the stopgap the finding itself proposes).** New
`apps/consumer/src/__tests__/constants.test.ts` reads
`backend/src/modules/reservations/reservations.service.ts` from disk,
regex-extracts the real `CANCEL_DEADLINE_BEFORE_PICKUP_MS` expression,
evaluates it, and asserts equality with the consumer's mirrored constant.

**Revert-proof.** Temporarily changed the mirrored constant to `3 * 60 *
60 * 1000`:
```
Expected: 7200000
Received: 10800000
```
Reverted back; test passes again.

---

## M16(orig) — three of four dead-end sub-items closed

1. **`merchant.stores.get`/`merchant.bagTemplates.get`** — zero callers
   confirmed across `apps/`, `landing/`, `e2e/`. Deleted from
   `packages/api-client/src/domains/merchant.ts`.
2. **`marketingEnabled` toggle** — persisted and rendered, but no
   `NotificationKind` in the backend's `notification-policy.table.ts`
   maps to it, so it controlled nothing. Removed the control from
   `notification-preferences.tsx` and stopped sending the field in the
   PATCH body (chose the sketch's option (a) — hide, don't fabricate a
   backend wiring I can't verify).
3. **Commission invoices invisible everywhere** — `commissionInvoices`
   was already in `GET /admin/settlements/:id`'s response
   (`SettlementsService.adminGet`) but no screen rendered it. Added an
   invoices card to `SettlementDetailPage.tsx` (type/status/total per
   invoice).
4. **DRAFT-invoice count dashboard tile — BLOCKED, backend.** Needs a new
   aggregate field on `AdminDashboardResponseDto` (confirmed: today's DTO
   has `pendingMerchantApprovals`/`openComplaints`/`complaintsSlaAtRisk`/
   `openReports`/`settlementBatchesNeedingAttention`/`today`, nothing
   invoice-related). **Not attempted.**

**Tests.** `notification-preferences-screen.test.tsx` (2 cases: no
marketing toggle rendered, PATCH never sends the field);
`SettlementDetailPage.spec.tsx` (2 cases: empty state, invoice
type/status/total rendered).

**Revert-proof (marketing toggle):**
```
Received: <Text ...>Kampanya ve duyurular</Text>
```
**Revert-proof (invoices):** both new tests fail on revert (component
never queries `commissionInvoices` before the fix).

---

## M17(orig) — 261-line hand-mirrored response types replaced

**What was wrong.** `apps/consumer/src/lib/api-types.ts` hand-mirrored
~15 backend response DTOs across ~270 lines, headed by a 27-line comment
claiming `SuccessBody<P,M>` collapses to `Promise<never>` for all 81
client operations. Confirmed that premise is false against the current
build (`packages/api-client/dist/domains/discovery.d.ts` resolves a
concrete `{items, total, page, pageSize}` shape, not `never`) — both
`apps/merchant-web` (`response-types.ts`) and `apps/admin-web`
(`admin-types.ts`) already completed the same migration, both citing
commit `e5621a3`.

**Fix.** Rewrote `api-types.ts` mirroring `admin-types.ts`'s exact
pattern: every type is now `Awaited<ReturnType<typeof client...>>` (or a
narrowed projection off one, e.g. `ReservationItem =
ReservationListResponse["items"][number]`), same exported names as
before. No `any` anywhere in the file.

**Verification.** Every one of the 9 consuming files (`order/[id].tsx`,
`favorites.tsx`, `(tabs)/index.tsx`, `orders.tsx`, `MapPane.native.tsx`,
`MapPane.types.ts`, `OfferCard.tsx`, `OrderRow.tsx`,
`use-order-details.ts`) plus 4 test files needed **zero changes** — same
names, structurally identical shapes. `tsc --noEmit` clean; full suite
(85 tests) passes unmodified. Net **113 lines deleted**.

This is a type-safety/architecture fix with no runtime behavior change
(by construction — the projected types describe the exact same real
response shapes the hand-typed ones described), so the correct
regression proof is "the full suite's existing assertions, which
exercise these types through real component rendering, are unaffected" —
confirmed, not a fabricated revert test.

---

## M18(orig) — `AbortSignal` now reachable from 5 domain methods

**What was wrong.** `engine.ts`'s `RequestOptions.signal` was already
wired all the way to the real `fetch()` call, but none of the 13 domain
modules exposed it in their public signature — no app could ever
actually pass one, so a rapid filter change or search retype could never
cancel the superseded in-flight request.

**Fix.** Added an optional trailing `opts?: { signal?: AbortSignal }` to
`discovery.offers`/`map`/`store`/`offer` and `reservations.listMine` (the
read-heavy methods the finding itself names), forwarded into
`engine.request`. Backward compatible — every existing call site
(consumer, landing) is unaffected since the parameter is optional and
unused by them.

**Test.** New `packages/api-client/test/abort-signal.spec.ts` (4 cases):
the exact `AbortController.signal` instance passed to
`discovery.offers`/`discovery.store`/`reservations.listMine` is asserted
to reach the mocked `fetch()`'s `init.signal` unchanged; a 4th case
confirms calling with no `opts` at all still works (`signal` stays
optional).

**Revert-proof.** Reverting the two domain files fails **both** at
compile time (`tsc`: `Expected 1 arguments, but got 2`) and at runtime
(3 of 4 tests fail — `init.signal` is `undefined`).

---

## Verification — every workspace touched, after every fix

Commands run per workspace (all green as of the final commit
`a1dbdb0`):

**`packages/ui-tokens`**
```
npm run build -w @kurtar/ui-tokens         # tsc — clean
npx eslint "src/**/*.ts"                   # clean
```

**`packages/api-client`**
```
npm run build -w @kurtar/api-client        # tsc — clean
npx tsc --noEmit -p tsconfig.json          # clean
npx tsc --noEmit -p tsconfig.test.json     # clean
npx eslint "src/**/*.ts"                   # clean
npx jest                                   # 7 suites, 65 tests, all pass
```

**`apps/consumer`**
```
npx tsc --noEmit          # clean
npx eslint src --max-warnings=0            # clean
npx jest                                   # 20 suites, 85 tests, all pass
```
(`expo-doctor` reports 4 pre-existing, network/environment-caused
failures — no Expo-API connectivity in this sandbox, a known
React-19-vs-18 nested-copy hoisting artifact already documented in
`test-utils/render.tsx`'s own comment. None relate to this round's
changes; the same failures reproduce on the unmodified base commit.)

**`apps/admin-web`**
```
npx tsc -b --noEmit                        # clean
npx eslint "src/**/*.{ts,tsx}" --max-warnings=0   # clean
npx vitest run                             # 13 files, 83 tests, all pass
npx vite build                             # succeeds
```

**`apps/merchant-web`**
```
npx tsc -b --noEmit                        # clean
npx eslint "src/**/*.{ts,tsx}" --max-warnings=0   # clean
npx vitest run                             # 13 files, 76 tests, all pass
npx vite build                             # succeeds
```

**`landing`**
```
npx eslint                                 # clean
npx tsc --noEmit                           # clean
npx vitest run                             # 10 files, 46 tests, all pass
npx next build                             # succeeds (74 pages)
```

Every behavioral fix's revert-proof (temporarily undoing just that
fix's source change and re-running its test) is recorded in the
finding's own section above, with the actual failing output pasted
verbatim — not asserted from memory.

---

## What's still open

1. **I9 backend half** — split `RESERVATION_NOT_REDEEMABLE` into
   `RESERVATION_PICKUP_NOT_STARTED` / `RESERVATION_PICKUP_WINDOW_PASSED`,
   and add `pickupStartAt`/`pickupEndAt` to `ReservationDto`. Needs
   `backend/`.
2. **I14** — audit-log the merchant CSV export; drop `iban`/`legalName`
   from `SettlementsService.adminGet`'s select. Needs `backend/`.
3. **M16(orig) dashboard tile** — a DRAFT-invoice count aggregate field
   on `AdminDashboardResponseDto`. Needs `backend/`.

All three are named, not silently worked around, per the task's
instructions.
