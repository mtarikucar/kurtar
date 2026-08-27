/**
 * Reversible, idempotent demo dataset for a human evaluating kurtar for
 * the first time — an İstanbul-flavoured slice of the whole product:
 * merchants across three districts and every segment in the business
 * plan, offers in every browsable state, a consumer for every
 * reservation status (including one whose pickup window is live RIGHT
 * NOW, so the redeem screen has something to demonstrate), a complaint
 * mid-thread and one near its SLA deadline, a content report near its
 * takedown deadline, and both a settled and a pending settlement batch.
 *
 * HOW THIS STAYS REVERSIBLE: every row this script creates gets an
 * explicit, human-readable primary key prefixed `kd-demo-` (Prisma's
 * `@id @default(cuid())` only supplies a default — passing an explicit
 * `id` in `.create()` is always honoured). Real, operator-created data
 * always gets a `cuid()`-shaped id instead, which can never collide with
 * this prefix. `teardownDemo()` deletes every row whose id (or, for the
 * one join table with no independent id, whose foreign key) carries the
 * prefix, in strict reverse-dependency order — nothing it removes was
 * ever created outside this file. `seedDemo()` itself calls
 * `teardownDemo()` first, so re-running the seed (npm run seed:demo)
 * is idempotent: same end state every time, never duplicate rows.
 *
 * WHY DIRECT PRISMA WRITES, NOT THE REAL HTTP/SERVICE LAYER: going
 * through the real endpoints would fire real outbox events (emails, SMS,
 * push) for entirely fake demo activity, and would need every
 * intermediate state transition replayed one at a time (submit -> review
 * -> approve, publish -> reserve -> webhook -> redeem -> settle -> ...).
 * This script instead writes the END STATE directly — except for the
 * settlement math and the impact-ledger math, which are pure,
 * framework-free functions this file imports and calls for real
 * (`computeSettlement`, `computeImpactLine`) rather than hand-deriving
 * numbers that could silently drift from what the app itself would
 * compute.
 *
 * Usage:
 *   npm run seed:demo -w backend        # teardown + recreate
 *   npm run seed:demo:down -w backend   # teardown only
 */
import { Prisma, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { generateReservationCode } from "../src/modules/reservations/reservation-code.util";
import { generateMerchantOid } from "../src/modules/reservations/merchant-oid.util";
import { computeSettlement } from "../src/modules/settlements/settlement-math";
import { computeImpactLine } from "../src/modules/impact/impact-math";
import { CO2E_PER_BAG_GRAMS_DEFAULT } from "../src/modules/impact/impact.constants";
import {
  istanbulDateKey,
  offerDateToDbDate,
} from "../src/common/utils/istanbul-date.util";

const prisma = new PrismaClient();

// Demo-only credentials — every login in this file uses the SAME fixed
// password, documented (as demo-only) in the root README.
const DEMO_PASSWORD = "KurtarDemo123!";
const BCRYPT_COST = 10; // lower than production's 12 — this script re-hashes on every re-seed

/** Every id this script creates carries this prefix — see file doc comment. */
const PREFIX = "kd-demo-";
function did(suffix: string): string {
  return `${PREFIX}${suffix}`;
}

// ---------------------------------------------------------------------
// Date helpers — Europe/Istanbul is fixed UTC+3 year-round (no DST since
// 2016), matching every other date-math file in this codebase.
// ---------------------------------------------------------------------
const ISTANBUL_UTC_OFFSET_HOURS = 3;

/** The UTC instant for `hour:minute` Istanbul-local time, `daysFromToday`
 * calendar days from today (Istanbul calendar, so this is correct near
 * midnight regardless of the machine running this script's own timezone). */
function istanbulInstant(
  daysFromToday: number,
  hour: number,
  minute: number,
): Date {
  const base = new Date(Date.now() + daysFromToday * 86_400_000);
  const [y, m, d] = istanbulDateKey(base).split("-").map(Number);
  return new Date(
    Date.UTC(y, m - 1, d, hour - ISTANBUL_UTC_OFFSET_HOURS, minute, 0, 0),
  );
}

function istanbulOfferDate(daysFromToday: number): Date {
  const base = new Date(Date.now() + daysFromToday * 86_400_000);
  return offerDateToDbDate(istanbulDateKey(base));
}

// ---------------------------------------------------------------------
// Turkish IBAN generation — real ISO 7064 MOD97-10 check digits (the
// inverse of backend/src/common/utils/iban.util.ts's `isValidIbanChecksum`),
// so every demo merchant's IBAN actually validates, not just format-matches.
// ---------------------------------------------------------------------
function demoIban(bbanDigits: string): string {
  if (!/^\d{22}$/.test(bbanDigits)) {
    throw new Error(
      `demoIban: bban must be exactly 22 digits, got "${bbanDigits}"`,
    );
  }
  // Country code letters -> numbers (T=29, R=27), check digits as "00",
  // moved to the end, per ISO 7064.
  const rearranged = `${bbanDigits}292700`;
  let remainder = 0;
  for (const ch of rearranged) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  const checkDigits = String(98 - remainder).padStart(2, "0");
  return `TR${checkDigits}${bbanDigits}`;
}

async function hashPassword(): Promise<string> {
  return bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
}

// ---------------------------------------------------------------------
// Static demo content
// ---------------------------------------------------------------------

const ALLERGEN_BAKERY = "Gluten, süt ve yumurta içerebilir.";
const ALLERGEN_MEAL =
  "İçerik günlük menüye göre değişir; gluten, süt ürünleri ve kuruyemiş içerebilir.";
const ALLERGEN_PRODUCE =
  "Ürünler mevsime göre değişir; bilinen alerjen içermez, çapraz bulaşma olabilir.";

interface MerchantSeed {
  n: number; // stable index used to derive every child id
  legalName: string;
  tradeName: string;
  taxId: string;
  iban: string;
  verificationStatus: "DRAFT" | "APPROVED" | "SUSPENDED";
  ownerName: string;
  ownerEmail: string;
  store?: {
    name: string;
    district: string;
    city: string;
    latitude: number;
    longitude: number;
    category: "BAKERY" | "MEAL" | "PRODUCE";
    bagTitle: string;
    priceCents: number;
    originalMinCents: number;
    originalMaxCents: number;
    allergen: string;
  };
}

const MERCHANTS: MerchantSeed[] = [
  {
    n: 1,
    legalName: "Moda Ekmek ve Unlu Mamuller Ltd. Şti.",
    tradeName: "Moda Fırın",
    taxId: "7000000001",
    iban: demoIban("0006100000000000000001"),
    verificationStatus: "APPROVED",
    ownerName: "Hakan Yıldız",
    ownerEmail: "hakan@modafirin.demo.kurtar.app",
    store: {
      name: "Moda Fırın",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.9789,
      longitude: 29.028,
      category: "BAKERY",
      bagTitle: "Fırından Sürpriz Paket",
      priceCents: 6900,
      originalMinCents: 15000,
      originalMaxCents: 22000,
      allergen: ALLERGEN_BAKERY,
    },
  },
  {
    n: 2,
    legalName: "Yeldeğirmeni Pastacılık San. Tic. A.Ş.",
    tradeName: "Yeldeğirmeni Pastanesi",
    taxId: "7000000002",
    iban: demoIban("0006100000000000000002"),
    verificationStatus: "APPROVED",
    ownerName: "Sibel Kurt",
    ownerEmail: "sibel@yeldegirmenipastanesi.demo.kurtar.app",
    store: {
      name: "Yeldeğirmeni Pastanesi",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.9908,
      longitude: 29.0347,
      category: "BAKERY",
      bagTitle: "Pastane Sürpriz Kutusu",
      priceCents: 14900,
      originalMinCents: 28000,
      originalMaxCents: 38000,
      allergen: ALLERGEN_BAKERY,
    },
  },
  {
    n: 3,
    legalName: "Caferağa Kahvecilik Ltd. Şti.",
    tradeName: "Caferağa Kahve Evi",
    taxId: "7000000003",
    iban: demoIban("0006100000000000000003"),
    verificationStatus: "APPROVED",
    ownerName: "Onur Aydemir",
    ownerEmail: "onur@caferagakahve.demo.kurtar.app",
    store: {
      name: "Caferağa Kahve Evi",
      district: "Kadıköy",
      city: "İstanbul",
      latitude: 40.9847,
      longitude: 29.0292,
      category: "MEAL",
      bagTitle: "Kafe Sürpriz Paketi",
      priceCents: 11900,
      originalMinCents: 22000,
      originalMaxCents: 30000,
      allergen: ALLERGEN_MEAL,
    },
  },
  {
    n: 4,
    legalName: "Barbaros Lokantacılık Gıda A.Ş.",
    tradeName: "Barbaros Lokantası",
    taxId: "7000000004",
    iban: demoIban("0006100000000000000004"),
    verificationStatus: "APPROVED",
    ownerName: "Ferhat Öz",
    ownerEmail: "ferhat@barbaroslokantasi.demo.kurtar.app",
    store: {
      name: "Barbaros Lokantası",
      district: "Beşiktaş",
      city: "İstanbul",
      latitude: 41.043,
      longitude: 29.0075,
      category: "MEAL",
      bagTitle: "Lokanta Günün Menüsü Sürpriz Paketi",
      priceCents: 16900,
      originalMinCents: 32000,
      originalMaxCents: 42000,
      allergen: ALLERGEN_MEAL,
    },
  },
  {
    n: 5,
    legalName: "Beşiktaş Manavcılık Tic. Ltd. Şti.",
    tradeName: "Beşiktaş Manav Ali Usta",
    taxId: "7000000005",
    iban: demoIban("0006100000000000000005"),
    verificationStatus: "APPROVED",
    ownerName: "Ali Usta",
    ownerEmail: "ali@besiktasmanav.demo.kurtar.app",
    store: {
      name: "Beşiktaş Manav Ali Usta",
      district: "Beşiktaş",
      city: "İstanbul",
      latitude: 41.0415,
      longitude: 29.0043,
      category: "PRODUCE",
      bagTitle: "Manav Sürpriz Kutusu",
      priceCents: 9900,
      originalMinCents: 18000,
      originalMaxCents: 26000,
      allergen: ALLERGEN_PRODUCE,
    },
  },
  {
    n: 6,
    legalName: "Levent Ekmek Fırıncılık A.Ş.",
    tradeName: "Levent Fırın",
    taxId: "7000000006",
    iban: demoIban("0006100000000000000006"),
    verificationStatus: "APPROVED",
    ownerName: "Murat Demirtaş",
    ownerEmail: "murat@leventfirin.demo.kurtar.app",
    store: {
      name: "Levent Fırın",
      district: "Beşiktaş",
      city: "İstanbul",
      latitude: 41.0815,
      longitude: 29.0107,
      category: "BAKERY",
      bagTitle: "Fırından Sürpriz Paket",
      priceCents: 6900,
      originalMinCents: 15000,
      originalMaxCents: 22000,
      allergen: ALLERGEN_BAKERY,
    },
  },
  {
    n: 7,
    legalName: "Nişantaşı Kahve Durağı Gıda Ltd. Şti.",
    tradeName: "Nişantaşı Kahve Durağı",
    taxId: "7000000007",
    iban: demoIban("0006100000000000000007"),
    // DRAFT — never submitted for review yet, so no store/bag template/
    // offer exists for this one (that's exactly what "still onboarding"
    // looks like).
    verificationStatus: "DRAFT",
    ownerName: "Pelin Korkmaz",
    ownerEmail: "pelin@nisantasikahve.demo.kurtar.app",
  },
  {
    n: 8,
    legalName: "Mecidiyeköy Ocakbaşı Restoran A.Ş.",
    tradeName: "Mecidiyeköy Ocakbaşı",
    taxId: "7000000008",
    iban: demoIban("0006100000000000000008"),
    // SUSPENDED — the kill-switch demo case: had a live store/offer, now
    // pulled from every discovery surface (see docs/operations.md).
    verificationStatus: "SUSPENDED",
    ownerName: "Tolga Aksu",
    ownerEmail: "tolga@mecidiyekoyocakbasi.demo.kurtar.app",
    store: {
      name: "Mecidiyeköy Ocakbaşı",
      district: "Şişli",
      city: "İstanbul",
      latitude: 41.0662,
      longitude: 29.0089,
      category: "MEAL",
      bagTitle: "Ocakbaşı Sürpriz Paketi",
      priceCents: 16900,
      originalMinCents: 32000,
      originalMaxCents: 42000,
      allergen: ALLERGEN_MEAL,
    },
  },
];

interface ConsumerSeed {
  n: number;
  name: string;
  phoneE164: string;
}

const CONSUMERS: ConsumerSeed[] = [
  { n: 1, name: "Ayşe Yılmaz", phoneE164: "+905551110001" }, // PENDING_PAYMENT
  { n: 2, name: "Elif Demir", phoneE164: "+905551110002" }, // CONFIRMED, live pickup window
  { n: 3, name: "Mehmet Kaya", phoneE164: "+905551110003" }, // REDEEMED, rating pending moderation
  { n: 4, name: "Zeynep Şahin", phoneE164: "+905551110004" }, // REDEEMED, rating approved (+ complaint)
  { n: 5, name: "Can Öztürk", phoneE164: "+905551110005" }, // NO_SHOW (+ complaint near SLA deadline)
  { n: 6, name: "Deniz Aydın", phoneE164: "+905551110006" }, // CANCELLED_BY_USER
  { n: 7, name: "Burak Şen", phoneE164: "+905551110007" }, // CANCELLED_BY_MERCHANT
  { n: 8, name: "Gizem Aksoy", phoneE164: "+905551110008" }, // EXPIRED
  { n: 9, name: "Selin Arslan", phoneE164: "+905551110009" }, // REDEEMED, rating auto-approved (no comment)
];

// =======================================================================
// TEARDOWN — reverse-dependency order. Every deleteMany here is scoped to
// this file's `kd-demo-` id prefix (or, where a model has no independent
// id, the matching foreign key) — never a bare deleteMany({}).
// =======================================================================
/**
 * `client` defaults to the module-level `prisma` (its own implicit
 * transaction per statement) for standalone use — `npm run seed:demo:down`
 * and this file's own CLI entry point both call it that way. `seedDemo()`
 * instead passes its own `tx` (a `Prisma.TransactionClient`) so the
 * teardown runs INSIDE the same transaction as the recreate below — see
 * that function's own comment for why that matters.
 */
export async function teardownDemo(
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  const byPrefix = { id: { startsWith: PREFIX } };

  await client.contentReport.deleteMany({ where: byPrefix });
  await client.complaintMessage.deleteMany({
    where: { complaintId: { startsWith: PREFIX } },
  });
  await client.complaintTicket.deleteMany({ where: byPrefix });

  await client.commissionInvoice.deleteMany({ where: byPrefix });
  // Settlement lines are keyed by reservationId, and a settled demo bag's
  // line survives a prefix-only delete for the same reason its reservation
  // does. Allocations cascade from the line.
  await client.settlementLine.deleteMany({
    where: {
      OR: [
        byPrefix,
        {
          reservation: {
            OR: [
              { offerId: { startsWith: PREFIX } },
              { storeId: { startsWith: PREFIX } },
            ],
          },
        },
      ],
    },
  });
  await client.settlementBatch.deleteMany({ where: byPrefix });

  // Everything below is keyed on WHICH RESERVATIONS BELONG TO THE DEMO,
  // not on whose id happens to carry the prefix.
  //
  // A reservation made by USING the demo — the whole point of seeding it —
  // gets a generated cuid, so a prefix-only teardown left it behind and the
  // offer delete then died on `reservations_offerId_fkey`. In other words
  // the seed could be torn down only until somebody actually used it. A
  // reservation against a demo offer IS demo data by definition, so it is
  // in scope; nothing here can reach a row that hangs off a real offer.
  const demoRezervasyonlar = await client.reservation.findMany({
    where: {
      OR: [
        byPrefix,
        { offerId: { startsWith: PREFIX } },
        { storeId: { startsWith: PREFIX } },
      ],
    },
    select: { id: true },
  });
  const rezervasyonIdleri = demoRezervasyonlar.map((r) => r.id);
  const rezervasyonda = { reservationId: { in: rezervasyonIdleri } };

  await client.rating.deleteMany({ where: { OR: [byPrefix, rezervasyonda] } });
  await client.impactLedger.deleteMany({
    where: { OR: [byPrefix, rezervasyonda] },
  });
  // Refund hangs off Payment, which hangs off Reservation — so it is
  // reached through the payments of those reservations, not directly.
  await client.refund.deleteMany({
    where: { OR: [byPrefix, { payment: { is: rezervasyonda } }] },
  });
  await client.payment.deleteMany({ where: { OR: [byPrefix, rezervasyonda] } });
  await client.reservation.deleteMany({
    where: { OR: [byPrefix, { id: { in: rezervasyonIdleri } }] },
  });

  await client.dailyOffer.deleteMany({ where: byPrefix });
  await client.bagTemplate.deleteMany({ where: byPrefix });
  await client.store.deleteMany({ where: byPrefix });

  await client.membershipSubscription.deleteMany({ where: byPrefix });
  await client.merchantUser.deleteMany({ where: byPrefix });
  await client.merchant.deleteMany({ where: byPrefix });

  await client.user.deleteMany({ where: byPrefix });
  await client.adminUser.deleteMany({ where: byPrefix });
}

// =======================================================================
// SEED
// =======================================================================
export async function seedDemo(): Promise<void> {
  const passwordHash = await hashPassword();
  const now = new Date();

  // Teardown runs AS THE FIRST STATEMENT INSIDE this same transaction, not
  // as a separate call before it (as this used to work): the old shape
  // committed the teardown's deletes on their own, so a failure ANYWHERE
  // in the recreate that follows rolled back only the recreate — leaving
  // the database with NO demo data at all instead of either the old
  // dataset (untouched) or the new one. One transaction means a mid-seed
  // failure is a true no-op: either the whole teardown+recreate commits,
  // or none of it does, and the previous run's demo data (if any) is
  // exactly what's left.
  await prisma.$transaction(
    async (tx) => {
      await teardownDemo(tx);

      // ---- Admin ---------------------------------------------------
      await tx.adminUser.create({
        data: {
          id: did("admin-1"),
          email: "demo.admin@kurtar.app",
          passwordHash,
          name: "Demo Admin",
          active: true,
        },
      });

      // ---- Merchants + owners + stores + bag templates --------------
      const bagFeeCents =
        (
          await tx.platformPricing.findFirst({
            orderBy: { effectiveFrom: "desc" },
          })
        )?.bagFeeCents ?? 2500;

      for (const m of MERCHANTS) {
        await tx.merchant.create({
          data: {
            id: did(`merchant-${m.n}`),
            legalName: m.legalName,
            tradeName: m.tradeName,
            taxId: m.taxId,
            iban: m.iban,
            verificationStatus: m.verificationStatus,
            verifiedAt:
              m.verificationStatus === "DRAFT"
                ? null
                : istanbulInstant(-90, 10, 0),
            sttAttestationAcceptedAt: istanbulInstant(-91, 9, 0),
            intermediationContractVersion: "2026-08",
            intermediationAcceptedAt: istanbulInstant(-91, 9, 0),
            createdAt: istanbulInstant(-91, 9, 0),
          },
        });
        await tx.merchantUser.create({
          data: {
            id: did(`merchant-user-${m.n}`),
            merchantId: did(`merchant-${m.n}`),
            email: m.ownerEmail,
            name: m.ownerName,
            passwordHash,
            role: "OWNER",
            createdAt: istanbulInstant(-91, 9, 0),
          },
        });

        // A MembershipSubscription is normally created by the
        // merchant.approved.v1 outbox handler — hand-created here for
        // every merchant that has ever been APPROVED (including the now-
        // SUSPENDED one), fully paid, so GET /membership/mine works from
        // the merchant panel exactly like it would for a real approved
        // merchant.
        if (m.verificationStatus !== "DRAFT") {
          const anchor = istanbulInstant(-90, 10, 0);
          const periodEnd = new Date(anchor.getTime());
          periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
          await tx.membershipSubscription.create({
            data: {
              id: did(`membership-${m.n}`),
              merchantId: did(`merchant-${m.n}`),
              anchorDate: anchor,
              currentPeriodStart: anchor,
              currentPeriodEnd: periodEnd,
              priceCents: 199000,
              vatCents: 39800,
              status: "ACTIVE",
              outstandingCents: 0,
              outstandingVatCents: 0,
              periodPaidAt: anchor,
            },
          });
        }

        if (!m.store) continue;
        const storeId = did(`store-${m.n}`);
        await tx.store.create({
          data: {
            id: storeId,
            merchantId: did(`merchant-${m.n}`),
            name: m.store.name,
            address: `${m.store.district}, İstanbul`,
            district: m.store.district,
            city: m.store.city,
            latitude: m.store.latitude,
            longitude: m.store.longitude,
            categoryTags: [m.store.category],
            active: m.verificationStatus !== "SUSPENDED",
            createdAt: istanbulInstant(-90, 11, 0),
          },
        });
        await tx.$executeRaw`
          UPDATE "stores"
          SET "location" = ST_SetSRID(ST_MakePoint(${m.store.longitude}, ${m.store.latitude}), 4326)::geography
          WHERE "id" = ${storeId}
        `;
        await tx.bagTemplate.create({
          data: {
            id: did(`template-${m.n}`),
            storeId,
            title: m.store.bagTitle,
            category: m.store.category,
            dietFlags: [],
            allergenDisclaimer: m.store.allergen,
            originalValueCentsMin: m.store.originalMinCents,
            originalValueCentsMax: m.store.originalMaxCents,
            priceCents: m.store.priceCents,
            createdAt: istanbulInstant(-90, 11, 0),
          },
        });
      }

      // ---- Today's + tomorrow's browsing offers (merchants 1-6) -----
      // Deliberately varied states per the brief: [1] published/plenty,
      // [2] nearly sold out, [3] sold out, [4] closed, [5] published/
      // plenty, [6] published — and [6] ALSO hosts the live-pickup-window
      // reservation below, so its window is anchored to "now" rather than
      // the usual 19:00-21:00 slot every other today-offer uses.
      const todayDate = istanbulOfferDate(0);
      const tomorrowDate = istanbulOfferDate(1);
      const pickupStart19 = istanbulInstant(0, 19, 0);
      const pickupEnd21 = istanbulInstant(0, 21, 0);
      const publishedEarlier = istanbulInstant(0, 17, 5);

      const todayOfferPlan: Array<{
        n: number;
        status: "PUBLISHED" | "SOLD_OUT" | "CLOSED";
        qtyTotal: number;
        qtyReserved: number;
      }> = [
        { n: 1, status: "PUBLISHED", qtyTotal: 8, qtyReserved: 2 },
        { n: 2, status: "PUBLISHED", qtyTotal: 5, qtyReserved: 4 }, // nearly sold out
        { n: 3, status: "SOLD_OUT", qtyTotal: 6, qtyReserved: 6 },
        { n: 4, status: "CLOSED", qtyTotal: 6, qtyReserved: 1 },
        { n: 5, status: "PUBLISHED", qtyTotal: 10, qtyReserved: 3 },
        { n: 6, status: "PUBLISHED", qtyTotal: 6, qtyReserved: 1 },
      ];
      for (const o of todayOfferPlan) {
        const live = o.n === 6;
        await tx.dailyOffer.create({
          data: {
            id: did(`offer-${o.n}-today`),
            bagTemplateId: did(`template-${o.n}`),
            storeId: did(`store-${o.n}`),
            offerDate: todayDate,
            qtyTotal: o.qtyTotal,
            qtyReserved: o.qtyReserved,
            qtyRedeemed: 0,
            // [Demo] Merchant 6's today offer is the one CONFIRMED
            // reservation below is meant to be "live" for RIGHT NOW,
            // whenever this seed happens to run — not the usual fixed
            // 19:00-21:00 evening slot every other today-offer below
            // uses. See the reservation section for the matching note.
            pickupStartAt: live ? istanbulInstant(0, 0, 0) : pickupStart19,
            pickupEndAt: live ? istanbulInstant(2, 0, 0) : pickupEnd21,
            status: o.status,
            publishedAt: publishedEarlier,
          },
        });
        if (live) {
          // Overwrite with a genuinely "now"-anchored window (not a whole
          // day span) — see the reservation section below. Ends 6 hours
          // from seed time, not 50 minutes: a demo that stops being
          // demonstrable under an hour after seeding is a real gap for
          // anyone giving a walkthrough later the same day. Clamped to
          // "no later than today, Istanbul-local 23:59" so this can never
          // cross into tomorrow's calendar day (validateOfferWindow's own
          // same-day rule — this write bypasses that validator, being a
          // raw seed update, but there is no reason for the seed's own
          // data to violate a rule the real API enforces).
          const sixHoursOut = now.getTime() + 6 * 3_600_000;
          const todayEnd = istanbulInstant(0, 23, 59).getTime();
          await tx.dailyOffer.update({
            where: { id: did(`offer-${o.n}-today`) },
            data: {
              pickupStartAt: new Date(now.getTime() - 10 * 60_000),
              pickupEndAt: new Date(Math.min(sixHoursOut, todayEnd)),
            },
          });
        }
      }

      const tomorrowPublishAt = istanbulInstant(1, 16, 55);
      const tomorrowPickupStart = istanbulInstant(1, 19, 0);
      const tomorrowPickupEnd = istanbulInstant(1, 21, 0);
      for (const n of [1, 2, 3, 4, 5, 6]) {
        await tx.dailyOffer.create({
          data: {
            id: did(`offer-${n}-tomorrow`),
            bagTemplateId: did(`template-${n}`),
            storeId: did(`store-${n}`),
            offerDate: tomorrowDate,
            qtyTotal: 6,
            qtyReserved: 0,
            qtyRedeemed: 0,
            pickupStartAt: tomorrowPickupStart,
            pickupEndAt: tomorrowPickupEnd,
            status: "SCHEDULED",
            publishAt: tomorrowPublishAt,
          },
        });
      }

      // The suspended merchant's offer — cancelled as part of the
      // kill-switch blast radius (docs/operations.md documents this).
      await tx.dailyOffer.create({
        data: {
          id: did("offer-8-today"),
          bagTemplateId: did("template-8"),
          storeId: did("store-8"),
          offerDate: todayDate,
          qtyTotal: 6,
          qtyReserved: 2,
          qtyRedeemed: 0,
          pickupStartAt: pickupStart19,
          pickupEndAt: pickupEnd21,
          status: "CANCELLED",
          publishedAt: publishedEarlier,
        },
      });

      // Two ALREADY-CLOSED past offers, dedicated to hosting the
      // REDEEMED/NO_SHOW reservations below — kept separate from the
      // today/tomorrow browsing offers above so their qty bookkeeping
      // never has to double as both "what's live to browse" and "what
      // already happened."
      const pastPickupStart = istanbulInstant(-1, 19, 0);
      const pastPickupEnd = istanbulInstant(-1, 21, 0);
      await tx.dailyOffer.create({
        data: {
          id: did("offer-2-past"),
          bagTemplateId: did("template-2"),
          storeId: did("store-2"),
          offerDate: istanbulOfferDate(-1),
          qtyTotal: 3,
          qtyReserved: 3, // Mehmet + Selin redeemed, Can never showed (stock stays claimed)
          qtyRedeemed: 2,
          pickupStartAt: pastPickupStart,
          pickupEndAt: pastPickupEnd,
          status: "CLOSED",
          publishedAt: istanbulInstant(-1, 17, 5),
        },
      });
      await tx.dailyOffer.create({
        data: {
          id: did("offer-3-past"),
          bagTemplateId: did("template-3"),
          storeId: did("store-3"),
          offerDate: istanbulOfferDate(-1),
          qtyTotal: 1,
          qtyReserved: 1,
          qtyRedeemed: 1,
          pickupStartAt: pastPickupStart,
          pickupEndAt: pastPickupEnd,
          status: "CLOSED",
          publishedAt: istanbulInstant(-1, 17, 5),
        },
      });

      // ---- Consumers --------------------------------------------------
      for (const c of CONSUMERS) {
        await tx.user.create({
          data: {
            id: did(`consumer-${c.n}`),
            phoneE164: c.phoneE164,
            phoneVerifiedAt: istanbulInstant(-30, 12, 0),
            name: c.name,
            status: "ACTIVE",
            locale: "tr",
          },
        });
      }

      // ---- Reservations + payments (+ refunds/ratings/impact) --------
      async function createPaidReservation(params: {
        consumerN: number;
        offerId: string;
        storeId: string;
        qty: number;
        unitPriceCents: number;
        status:
          | "PENDING_PAYMENT"
          | "CONFIRMED"
          | "REDEEMED"
          | "NO_SHOW"
          | "CANCELLED_BY_USER"
          | "CANCELLED_BY_MERCHANT"
          | "EXPIRED";
        cancelDeadlineAt: Date;
        createdAt: Date;
        redeemedAt?: Date;
        redeemedByActorType?: "CONSUMER" | "MERCHANT";
        paymentStatus: "INTENT" | "PAID" | "FAILED" | "REFUNDED";
        paidAt?: Date;
      }) {
        const reservationId = did(`resv-${params.consumerN}`);
        const totalCents = params.unitPriceCents * params.qty;
        await tx.reservation.create({
          data: {
            id: reservationId,
            code: generateReservationCode(),
            userId: did(`consumer-${params.consumerN}`),
            offerId: params.offerId,
            storeId: params.storeId,
            qty: params.qty,
            unitPriceCents: params.unitPriceCents,
            totalCents,
            status: params.status,
            cancelDeadlineAt: params.cancelDeadlineAt,
            redeemedAt: params.redeemedAt,
            redeemedByActorType: params.redeemedByActorType,
            redeemedByUserId:
              params.redeemedByActorType === "CONSUMER"
                ? did(`consumer-${params.consumerN}`)
                : undefined,
            createdAt: params.createdAt,
          },
        });
        const merchantOid = generateMerchantOid(reservationId);
        await tx.payment.create({
          data: {
            id: did(`payment-${params.consumerN}`),
            reservationId,
            provider: "MOCK",
            merchantOid,
            amountCents: totalCents,
            status: params.paymentStatus,
            idempotencyKey: `resv:${merchantOid}:${reservationId}`,
            paidAt: params.paidAt,
            createdAt: params.createdAt,
          },
        });
        return { reservationId, totalCents };
      }

      // [1] Ayşe — PENDING_PAYMENT at Moda Fırın's today offer.
      await createPaidReservation({
        consumerN: 1,
        offerId: did("offer-1-today"),
        storeId: did("store-1"),
        qty: 1,
        unitPriceCents: 6900,
        status: "PENDING_PAYMENT",
        cancelDeadlineAt: new Date(pickupStart19.getTime() - 2 * 3_600_000),
        createdAt: new Date(now.getTime() - 5 * 60_000),
        paymentStatus: "INTENT",
      });

      // [2] Elif — CONFIRMED, live pickup window (Levent Fırın), so the
      // consumer app's redeem screen can be demonstrated end to end right
      // after seeding.
      await createPaidReservation({
        consumerN: 2,
        offerId: did("offer-6-today"),
        storeId: did("store-6"),
        qty: 1,
        unitPriceCents: 6900,
        status: "CONFIRMED",
        cancelDeadlineAt: new Date(now.getTime() - 60 * 60_000),
        createdAt: new Date(now.getTime() - 30 * 60_000),
        paymentStatus: "PAID",
        paidAt: new Date(now.getTime() - 29 * 60_000),
      });

      // [3] Mehmet — REDEEMED at Yeldeğirmeni's past offer; rating has a
      // comment, so it starts PENDING moderation (also targeted by the
      // demo content report below).
      await createPaidReservation({
        consumerN: 3,
        offerId: did("offer-2-past"),
        storeId: did("store-2"),
        qty: 1,
        unitPriceCents: 14900,
        status: "REDEEMED",
        cancelDeadlineAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000),
        createdAt: new Date(pastPickupStart.getTime() - 3 * 3_600_000),
        redeemedAt: new Date(pastPickupStart.getTime() + 20 * 60_000),
        redeemedByActorType: "CONSUMER",
        paymentStatus: "PAID",
        paidAt: new Date(pastPickupStart.getTime() - 3 * 3_600_000 + 60_000),
      });
      await tx.rating.create({
        data: {
          id: did("rating-3"),
          reservationId: did("resv-3"),
          userId: did("consumer-3"),
          storeId: did("store-2"),
          overallStars: 5,
          foodQuality: 5,
          service: 4,
          comment: "Harika bir sürpriz kutuydu, kesinlikle tekrar alırım!",
          moderationStatus: "PENDING",
          createdAt: new Date(pastPickupStart.getTime() + 3 * 3_600_000),
        },
      });
      await tx.impactLedger.create({
        data: {
          id: did("impact-3"),
          reservationId: did("resv-3"),
          userId: did("consumer-3"),
          storeId: did("store-2"),
          ...computeImpactLine({
            qty: 1,
            co2ePerBagGrams: CO2E_PER_BAG_GRAMS_DEFAULT,
            totalCents: 14900,
            originalValueCentsMin: 28000,
            originalValueCentsMax: 38000,
          }),
        },
      });

      // [9] Selin — REDEEMED at the same past Yeldeğirmeni offer; no
      // comment, so the rating is auto-APPROVED and counts toward the
      // store's aggregate immediately.
      await createPaidReservation({
        consumerN: 9,
        offerId: did("offer-2-past"),
        storeId: did("store-2"),
        qty: 2,
        unitPriceCents: 14900,
        status: "REDEEMED",
        cancelDeadlineAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000),
        createdAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000),
        redeemedAt: new Date(pastPickupStart.getTime() + 25 * 60_000),
        redeemedByActorType: "CONSUMER",
        paymentStatus: "PAID",
        paidAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000 + 60_000),
      });
      await tx.rating.create({
        data: {
          id: did("rating-9"),
          reservationId: did("resv-9"),
          userId: did("consumer-9"),
          storeId: did("store-2"),
          overallStars: 5,
          foodQuality: 5,
          service: 5,
          comment: null,
          moderationStatus: "APPROVED",
          createdAt: new Date(pastPickupStart.getTime() + 26 * 60_000),
        },
      });
      await tx.impactLedger.create({
        data: {
          id: did("impact-9"),
          reservationId: did("resv-9"),
          userId: did("consumer-9"),
          storeId: did("store-2"),
          ...computeImpactLine({
            qty: 2,
            co2ePerBagGrams: CO2E_PER_BAG_GRAMS_DEFAULT,
            totalCents: 14900 * 2,
            originalValueCentsMin: 28000,
            originalValueCentsMax: 38000,
          }),
        },
      });
      await tx.store.update({
        where: { id: did("store-2") },
        data: { avgStars: 5, ratingCount: 1 }, // only Selin's counts — Mehmet's is still PENDING
      });

      // [4] Zeynep — REDEEMED at Caferağa's past offer; comment, already
      // APPROVED by an admin (a third, distinct rating-moderation state
      // alongside Mehmet's PENDING and Selin's auto-APPROVED). Also the
      // consumer behind the mid-thread complaint below.
      await createPaidReservation({
        consumerN: 4,
        offerId: did("offer-3-past"),
        storeId: did("store-3"),
        qty: 1,
        unitPriceCents: 11900,
        status: "REDEEMED",
        cancelDeadlineAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000),
        createdAt: new Date(pastPickupStart.getTime() - 4 * 3_600_000),
        redeemedAt: new Date(pastPickupStart.getTime() + 15 * 60_000),
        redeemedByActorType: "CONSUMER",
        paymentStatus: "PAID",
        paidAt: new Date(pastPickupStart.getTime() - 4 * 3_600_000 + 60_000),
      });
      await tx.rating.create({
        data: {
          id: did("rating-4"),
          reservationId: did("resv-4"),
          userId: did("consumer-4"),
          storeId: did("store-3"),
          overallStars: 4,
          foodQuality: 4,
          service: 4,
          comment: "Lezzetliydi ama porsiyon biraz küçüktü.",
          moderationStatus: "APPROVED",
          createdAt: new Date(pastPickupStart.getTime() + 30 * 60_000),
        },
      });
      await tx.impactLedger.create({
        data: {
          id: did("impact-4"),
          reservationId: did("resv-4"),
          userId: did("consumer-4"),
          storeId: did("store-3"),
          ...computeImpactLine({
            qty: 1,
            co2ePerBagGrams: CO2E_PER_BAG_GRAMS_DEFAULT,
            totalCents: 11900,
            originalValueCentsMin: 22000,
            originalValueCentsMax: 30000,
          }),
        },
      });
      await tx.store.update({
        where: { id: did("store-3") },
        data: { avgStars: 4, ratingCount: 1 },
      });

      // [5] Can — NO_SHOW at Yeldeğirmeni's past offer (paid, claimed
      // stock, never picked up — also the complainant near the SLA
      // deadline below).
      await createPaidReservation({
        consumerN: 5,
        offerId: did("offer-2-past"),
        storeId: did("store-2"),
        qty: 1,
        unitPriceCents: 14900,
        status: "NO_SHOW",
        cancelDeadlineAt: new Date(pastPickupStart.getTime() - 2 * 3_600_000),
        createdAt: new Date(pastPickupStart.getTime() - 1 * 3_600_000),
        paymentStatus: "PAID",
        paidAt: new Date(pastPickupStart.getTime() - 1 * 3_600_000 + 60_000),
      });

      // [6] Deniz — CANCELLED_BY_USER at Barbaros's today (closed) offer;
      // refunded in full.
      await createPaidReservation({
        consumerN: 6,
        offerId: did("offer-4-today"),
        storeId: did("store-4"),
        qty: 1,
        unitPriceCents: 16900,
        status: "CANCELLED_BY_USER",
        cancelDeadlineAt: new Date(pickupStart19.getTime() - 2 * 3_600_000),
        createdAt: new Date(now.getTime() - 3 * 3_600_000),
        paymentStatus: "REFUNDED",
        paidAt: new Date(now.getTime() - 3 * 3_600_000 + 60_000),
      });
      await tx.refund.create({
        data: {
          id: did("refund-6"),
          paymentId: did("payment-6"),
          amountCents: 16900,
          reason: "USER_CANCEL",
          status: "DONE",
          requestedByType: "CONSUMER",
          createdAt: new Date(now.getTime() - 2 * 3_600_000),
        },
      });

      // [7] Burak — CANCELLED_BY_MERCHANT at the same Barbaros offer;
      // refunded in full.
      await createPaidReservation({
        consumerN: 7,
        offerId: did("offer-4-today"),
        storeId: did("store-4"),
        qty: 1,
        unitPriceCents: 16900,
        status: "CANCELLED_BY_MERCHANT",
        cancelDeadlineAt: new Date(pickupStart19.getTime() - 2 * 3_600_000),
        createdAt: new Date(now.getTime() - 4 * 3_600_000),
        paymentStatus: "REFUNDED",
        paidAt: new Date(now.getTime() - 4 * 3_600_000 + 60_000),
      });
      await tx.refund.create({
        data: {
          id: did("refund-7"),
          paymentId: did("payment-7"),
          amountCents: 16900,
          reason: "MERCHANT_CANCEL",
          status: "DONE",
          requestedByType: "MERCHANT",
          createdAt: new Date(now.getTime() - 3.5 * 3_600_000),
        },
      });

      // [8] Gizem — EXPIRED (never completed payment in time) at
      // Yeldeğirmeni's today offer.
      await createPaidReservation({
        consumerN: 8,
        offerId: did("offer-2-today"),
        storeId: did("store-2"),
        qty: 1,
        unitPriceCents: 14900,
        status: "EXPIRED",
        cancelDeadlineAt: new Date(pickupStart19.getTime() - 2 * 3_600_000),
        createdAt: new Date(now.getTime() - 6 * 3_600_000),
        paymentStatus: "FAILED",
      });

      // ---- Complaints -----------------------------------------------
      // [1] Mid-thread — Zeynep complains about food quality at Caferağa;
      // the merchant has already replied, ticket stays open (not near its
      // 15-day deadline).
      const complaint1CreatedAt = new Date(now.getTime() - 3 * 86_400_000);
      const complaint1Deadline = new Date(
        complaint1CreatedAt.getTime() + 15 * 86_400_000,
      );
      await tx.complaintTicket.create({
        data: {
          id: did("complaint-1"),
          userId: did("consumer-4"),
          merchantId: did("merchant-3"),
          reservationId: did("resv-4"),
          category: "FOOD_QUALITY",
          description: "Paketteki tost soğuktu ve beklediğimden küçüktü.",
          status: "MERCHANT_RESPONDED",
          slaDeadlineAt: complaint1Deadline,
          createdAt: complaint1CreatedAt,
        },
      });
      await tx.complaintMessage.createMany({
        data: [
          {
            id: did("complaint-1-msg-1"),
            complaintId: did("complaint-1"),
            authorType: "CONSUMER",
            authorId: did("consumer-4"),
            body: "Paketteki tost soğuktu ve beklediğimden küçüktü, biraz hayal kırıklığı oldu.",
            createdAt: complaint1CreatedAt,
          },
          {
            id: did("complaint-1-msg-2"),
            complaintId: did("complaint-1"),
            authorType: "MERCHANT",
            authorId: did("merchant-user-3"),
            body: "Geri bildiriminiz için teşekkürler, bir dahaki paketinizde bunu telafi etmek isteriz.",
            createdAt: new Date(complaint1CreatedAt.getTime() + 5 * 3_600_000),
          },
          {
            id: did("complaint-1-msg-3"),
            complaintId: did("complaint-1"),
            authorType: "CONSUMER",
            authorId: did("consumer-4"),
            body: "Teşekkür ederim, tekrar denemek isterim.",
            createdAt: new Date(complaint1CreatedAt.getTime() + 6 * 3_600_000),
          },
        ],
      });

      // [2] Near its SLA deadline (within the 48h warning window) — Can
      // disputes his NO_SHOW.
      const complaint2Deadline = new Date(now.getTime() + 20 * 3_600_000);
      const complaint2CreatedAt = new Date(
        complaint2Deadline.getTime() - 15 * 86_400_000,
      );
      await tx.complaintTicket.create({
        data: {
          id: did("complaint-2"),
          userId: did("consumer-5"),
          merchantId: did("merchant-2"),
          reservationId: did("resv-5"),
          category: "STORE_CLOSED_NO_SHOW",
          description: "Teslim alma saatinde mağazaya gittim ama kapalıydı.",
          status: "OPEN",
          slaDeadlineAt: complaint2Deadline,
          createdAt: complaint2CreatedAt,
        },
      });
      await tx.complaintMessage.create({
        data: {
          id: did("complaint-2-msg-1"),
          complaintId: did("complaint-2"),
          authorType: "CONSUMER",
          authorId: did("consumer-5"),
          body: "Teslim alma saatinde mağazaya gittim ama kapalıydı, paketimi alamadım.",
          createdAt: complaint2CreatedAt,
        },
      });

      // ---- Content report (near its 48h takedown deadline) -----------
      const reportDeadline = new Date(now.getTime() + 6 * 3_600_000);
      const reportCreatedAt = new Date(
        reportDeadline.getTime() - 48 * 3_600_000,
      );
      await tx.contentReport.create({
        data: {
          id: did("report-1"),
          targetType: "RATING",
          targetId: did("rating-3"),
          reason: "Şüpheli/uygunsuz yorum şikayeti.",
          status: "OPEN",
          takedownDeadlineAt: reportDeadline,
          createdAt: reportCreatedAt,
        },
      });

      // ---- Settlement batches ----------------------------------------
      // Batch 1 (Yeldeğirmeni Pastanesi, merchant-2): SETTLED — covers
      // Mehmet's and Selin's redeemed lines from yesterday, already paid
      // out. The earnings screen's "history" and the admin finance
      // queue's "settled" filter both have real content.
      const batch1PeriodStart = istanbulInstant(-2, 0, 0);
      const batch1PeriodEnd = istanbulInstant(-1, 0, 0);
      const batch1Result = computeSettlement({
        lines: [
          { reservationId: did("resv-3"), grossCents: 14900, qty: 1 },
          { reservationId: did("resv-9"), grossCents: 29800, qty: 2 },
        ],
        bagFeeCents,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      });
      const batch1SentAt = new Date(now.getTime() - 2 * 86_400_000);
      await tx.settlementBatch.create({
        data: {
          id: did("batch-1"),
          merchantId: did("merchant-2"),
          periodStart: batch1PeriodStart,
          periodEnd: batch1PeriodEnd,
          status: "SETTLED",
          grossCents: batch1Result.grossCents,
          bagFeeCents: batch1Result.bagFeeCents,
          bagFeeVatCents: batch1Result.bagFeeVatCents,
          withholdingCents: batch1Result.withholdingCents,
          membershipOffsetCents: batch1Result.membershipOffsetCents,
          refundClawbackCents: batch1Result.refundClawbackCents,
          netPayoutCents: batch1Result.netPayoutCents,
          carriedShortfallCents: batch1Result.carriedShortfallCents,
          shortfallResolvedAt: batch1SentAt,
          payoutAttemptedAt: batch1SentAt,
          dueAt: batch1SentAt,
          pspTransferRef: "DEMO-PSP-REF-0001",
          sentAt: batch1SentAt,
          createdAt: new Date(batch1SentAt.getTime() - 3_600_000),
        },
      });
      for (const line of batch1Result.perLine) {
        const n = line.reservationId === did("resv-3") ? 3 : 9;
        await tx.settlementLine.create({
          data: {
            id: did(`line-${n}`),
            batchId: did("batch-1"),
            reservationId: line.reservationId,
            redeemedAt:
              n === 3
                ? new Date(pastPickupStart.getTime() + 20 * 60_000)
                : new Date(pastPickupStart.getTime() + 25 * 60_000),
            grossCents: line.grossCents,
            bagFeeCents: line.bagFeeCents,
            bagFeeVatCents: line.bagFeeVatCents,
            withholdingCents: line.withholdingCents,
          },
        });
      }
      await tx.commissionInvoice.create({
        data: {
          id: did("invoice-1"),
          merchantId: did("merchant-2"),
          batchId: did("batch-1"),
          type: "BAG_FEE",
          docType: "EARSIVFATURA",
          status: "SENT",
          issuedAt: batch1SentAt,
          netAmountCents: batch1Result.bagFeeCents,
          vatCents: batch1Result.bagFeeVatCents,
          totalAmountCents:
            batch1Result.bagFeeCents + batch1Result.bagFeeVatCents,
          createdAt: batch1SentAt,
        },
      });

      // Batch 2 (Caferağa Kahve Evi, merchant-3): CALCULATED — computed,
      // still awaiting admin approval. The admin finance queue's
      // "pending" filter has real content.
      const batch2PeriodStart = istanbulInstant(0, 0, 0);
      const batch2PeriodEnd = istanbulInstant(1, 0, 0);
      const batch2Result = computeSettlement({
        lines: [{ reservationId: did("resv-4"), grossCents: 11900, qty: 1 }],
        bagFeeCents,
        membershipDueCents: 0,
        priorClawbackCents: 0,
      });
      await tx.settlementBatch.create({
        data: {
          id: did("batch-2"),
          merchantId: did("merchant-3"),
          periodStart: batch2PeriodStart,
          periodEnd: batch2PeriodEnd,
          status: batch2Result.held ? "HELD" : "CALCULATED",
          grossCents: batch2Result.grossCents,
          bagFeeCents: batch2Result.bagFeeCents,
          bagFeeVatCents: batch2Result.bagFeeVatCents,
          withholdingCents: batch2Result.withholdingCents,
          membershipOffsetCents: batch2Result.membershipOffsetCents,
          refundClawbackCents: batch2Result.refundClawbackCents,
          netPayoutCents: batch2Result.netPayoutCents,
          carriedShortfallCents: batch2Result.carriedShortfallCents,
          shortfallResolvedAt: now,
          dueAt: new Date(now.getTime() + 7 * 86_400_000),
          createdAt: now,
        },
      });
      const [batch2Line] = batch2Result.perLine;
      await tx.settlementLine.create({
        data: {
          id: did("line-4"),
          batchId: did("batch-2"),
          reservationId: batch2Line.reservationId,
          redeemedAt: new Date(pastPickupStart.getTime() + 15 * 60_000),
          grossCents: batch2Line.grossCents,
          bagFeeCents: batch2Line.bagFeeCents,
          bagFeeVatCents: batch2Line.bagFeeVatCents,
          withholdingCents: batch2Line.withholdingCents,
        },
      });
    },
    // 45s, not the default 5s — this transaction now also runs
    // teardownDemo()'s 18 deleteMany statements as its first step (see
    // seedDemo()'s own comment), on top of the full recreate. 30s already
    // comfortably covered the recreate alone; a wider margin here is
    // cheap insurance, not a sign this is actually slow.
    { timeout: 45_000 },
  );
}

// =======================================================================
// CLI entry point
// =======================================================================
async function main() {
  const down = process.argv.includes("--down");
  if (down) {
    await teardownDemo();
    // eslint-disable-next-line no-console
    console.log("[seed-demo] Demo data removed.");
  } else {
    await seedDemo();
    // eslint-disable-next-line no-console
    console.log(
      "[seed-demo] Demo data seeded — 1 admin, 8 merchants, 9 consumers. See README.md for demo credentials.",
    );
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[seed-demo] Failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
