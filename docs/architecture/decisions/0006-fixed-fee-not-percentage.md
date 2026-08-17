# 6. Platform commission is a fixed fee per bag, not a percentage of sale price

## Status

Accepted (business plan; enforced in `settlement-math.ts` since Task 8).

## Context

Most marketplace platforms take a percentage of GMV. Kurtar's surprise bags are priced low by design (₺69-169 depending on segment — bakery, café, patisserie, restaurant, greengrocer) specifically to move food that would otherwise be thrown away; a percentage commission would tax the platform's own low-price mission (a cheaper bag would generate proportionally less revenue for doing the exact same amount of platform work — matching a buyer, processing a payment, running the redeem flow — as a more expensive one) and would make the platform's revenue directly dependent on merchants' pricing choices in a way that invites gaming (price the bag artificially high, undercut with an off-platform discount).

## Decision

The platform charges a **fixed ₺ amount per redeemed bag** (`PlatformPricing.bagFeeCents`, seeded at ₺25/2500 kuruş, %20 KDV on top — see `platform_pricing`'s seed migration), multiplied by quantity (`lineBagFeeCents = bagFeeCents_config * qty`, an exact integer product, computed once per settlement line in `settlement-math.ts`), plus a flat annual merchant membership fee (₺1.990 + KDV). Never a percentage of `totalCents`.

`PlatformPricing` is append-only, indexed by `effectiveFrom` — a price change is a **new row with a future effective date**, never an `UPDATE` of an existing one. Every settlement batch resolves its fee "as of" its own period's date, so a batch computed for a day before a price change keeps recomputing identically forever, even after the change ships — mutating history in place is exactly what this table's design prevents. A merchant's founding-member terms can override the platform default with a per-merchant fixed amount (`Merchant.bagFeeCentsOverride`) — still a fixed ₺ figure, never a rate.

## Consequences

- **The platform's revenue per bag is completely predictable and merchant-price-independent** — a ₺69 fırın bag and a ₺169 restoran bag cost the platform the same amount of real work (one match, one payment, one redeem), so they generate the same fee.
- **No incentive to undercut on-platform pricing** — since the fee doesn't scale with price, a merchant gains nothing by manipulating the listed price relative to the fee.
- **The withholding tax (%1 stopaj) base is computed AFTER the fixed fee is deducted** (`gross - bagFeeCents - bagFeeVatCents`), not on the raw sale price — see `docs/architecture/decisions/`'s settlement-ledger ADR and `settlement-math.ts`'s own doc comment for the GVK md.94/Law 7524 reasoning; this only makes sense because the fee itself is a known, fixed figure per line, not a percentage that would need to be backed out.
- **Historical settlement batches are immune to a pricing change** — auditing a batch from six months ago always reproduces the exact same numbers, because `PlatformPricing` is resolved by date, never mutated.
- **A pricing change requires inserting a new row with the right `effectiveFrom`**, not editing the current one — `PATCH`-style "just change the number" is deliberately not how this works, and there is no admin UI shortcut that bypasses it (see `docs/launch-checklist.md`'s note on founding-member terms being DB-only for the analogous per-merchant case).
