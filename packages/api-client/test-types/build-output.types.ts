/**
 * Type-level regression test for the `Promise<never>` bug (see core-
 * types.ts's `SuccessBody` doc comment for the root cause: openapi-
 * typescript emits response-status keys as NUMERIC literals, and a
 * numeric literal never structurally matches a STRING template-literal
 * pattern, which collapsed every domain method's compiled return type to
 * `never`).
 *
 * This file is NOT a jest spec — nothing here ever executes. It's
 * checked with `tsc --noEmit` against `tsconfig.build-types.json`
 * (`npm run typecheck:build`), and — this is the whole point — it
 * imports from `../dist`, the COMPILED package, not `../src`. The
 * `Promise<never>` bug was invisible to `tsc --noEmit -p tsconfig.json`
 * (source-level checking, where the checker can fully resolve a
 * conditional type at a call site with concrete literal arguments) and
 * to all 33 of this package's original runtime unit tests (mocked fetch,
 * asserting runtime VALUES — `never` is a compile-time-only defect, no
 * runtime behavior differs). It was only visible in the EMITTED
 * declaration file, which is exactly what a real consumer (an app's own
 * `tsc`) actually resolves against.
 *
 * The POSITIVE assertions below (assigning a real field to a concretely-
 * typed local, e.g. `const status: string = offer.status`) are the
 * load-bearing ones, not the `@ts-expect-error` lines: a bare `never`-
 * typed value genuinely DOES error loudly on property access ("Property
 * 'x' does not exist on type 'never'") — verified by deliberately
 * reintroducing the bug locally and confirming this file fails to
 * compile with exactly that error on every positive assertion below.
 * That's precisely why three independent app builds needed a sanctioned
 * cast to get past it: the error was real, just easy to read as "our
 * code is wrong" instead of "the package's declared types are wrong",
 * and each app silently worked around it instead of it being caught as
 * a shared, fixable bug. The `@ts-expect-error` lines are a secondary,
 * belt-and-suspenders signal — kept for the fields that are genuinely
 * absent from a real DTO regardless of the `never` bug.
 */
import { createClient } from "../dist/index";

declare const client: ReturnType<typeof createClient>;

async function offersCreateHasRealFields() {
  const offer = await client.offers.create({
    bagTemplateId: "bt_1",
    offerDate: "2026-08-20",
    qtyTotal: 10,
    pickupStartAt: "2026-08-20T18:00:00.000Z",
    pickupEndAt: "2026-08-20T20:00:00.000Z",
  });

  // Positive: a real field, used in a way that only typechecks if it's
  // genuinely typed as a string (not `never`, not `any`).
  const status: string = offer.status;
  void status;

  // Negative: proves the type isn't `never` (which would let this
  // through silently) and isn't `any` either (which would also let it
  // through). If this stops erroring, the directive below is "unused"
  // and tsc fails the build.
  // @ts-expect-error - "definitelyNotARealField" is not a property of the real OfferDto shape
  void offer.definitelyNotARealField;
}

async function reservationsListForMerchantHasRealFields() {
  // The newly-added pickup-list endpoint (GET /reservations/for-merchant,
  // commit 53be382) — also proves a freshly-added, paginated, array-typed
  // response resolves correctly, not just the older methods.
  const result = await client.reservations.listForMerchant({ page: 1, pageSize: 20 });

  const total: number = result.total;
  void total;

  const first = result.items[0];
  const code: string = first.code;
  const customerFirstName: string | null | undefined = first.customerFirstName;
  void code;
  void customerFirstName;

  // @ts-expect-error - "userId" is deliberately NOT on this DTO (see reservations.controller.ts's doc comment: no phone/email/surname/userId, a merchant needs to greet a customer, not view an account)
  void first.userId;
}

async function merchantSignupHasTheRicherActorShape() {
  // The bug #1 fix's own response type: MerchantSignupResponseDto, which
  // — unlike the generic AuthTokens alias — carries `merchant`, not a
  // hand-copied guess.
  const result = await client.merchant.signup({
    legalName: "Test İşletme A.Ş.",
    tradeName: "Test İşletme",
    taxId: "1234567890",
    iban: "TR330006100519786457841326",
    email: "owner@example.com",
    password: "hunter2hunter2",
    ownerName: "Test Owner",
  });

  const verificationStatus: string = result.merchant.verificationStatus;
  void verificationStatus;
}

async function refreshResponseDoesNotHaveMerchantField() {
  // POST /auth/refresh's response (AuthTokensDto -> the AuthTokens alias)
  // is the plain, shared shape — no `merchant`, no `user`. Proves each
  // operation keeps its OWN real type instead of every auth-issuing call
  // being collapsed into one shared, lowest-common-denominator alias.
  const tokens = await client.auth.refresh();
  const accessToken: string = tokens.accessToken;
  void accessToken;
  // @ts-expect-error - AuthTokensDto has no `merchant` field — that's MerchantSignupResponseDto's own, richer shape
  void tokens.merchant;
}

void offersCreateHasRealFields;
void reservationsListForMerchantHasRealFields;
void merchantSignupHasTheRicherActorShape;
void refreshResponseDoesNotHaveMerchantField;
