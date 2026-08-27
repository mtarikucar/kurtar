import { PrismaClient } from "@prisma/client";
import { teardownDemo } from "../../../prisma/seed-demo";

/**
 * The demo seed advertises itself as reversible: re-running it tears down
 * and recreates the same dataset, and `--down` removes every row it
 * created and nothing else.
 *
 * It could not do the first thing once anybody had USED the demo — which
 * is the only reason to seed it. The teardown deleted by id prefix, and a
 * reservation made through the app gets a generated cuid, so it survived
 * and the offer delete then died on `reservations_offerId_fkey`. The seed
 * worked exactly until it mattered.
 *
 * The widened teardown has to be tight in the other direction too: it may
 * reach a reservation because that reservation is against a demo offer,
 * and it must never reach one that is not. That is the half that would be
 * expensive to get wrong, so it is the half this proves.
 */
const PREFIX = "kd-demo-";
const OP = "op-teardown-scope-";

describe("teardownDemo — reversible after the demo has been used, and scoped to it", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });
  afterAll(async () => {
    await temizle();
    await prisma.$disconnect();
  });

  async function temizle() {
    await prisma.reservation.deleteMany({ where: { id: { startsWith: OP } } });
    await prisma.dailyOffer.deleteMany({ where: { id: { startsWith: OP } } });
    await prisma.bagTemplate.deleteMany({ where: { id: { startsWith: OP } } });
    await prisma.store.deleteMany({ where: { id: { startsWith: OP } } });
    await prisma.merchant.deleteMany({ where: { id: { startsWith: OP } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: OP } } });
  }

  /** A store + offer under `ad`'s prefix, plus one reservation whose own id
   * is given separately — the shape a real purchase produces. */
  async function kur(ad: string, rezervasyonId: string, telefon: string) {
    const merchant = await prisma.merchant.create({
      data: {
        id: `${ad}m`,
        legalName: `${ad} AŞ`,
        tradeName: ad,
        taxId: "1234567801",
        iban: "TR330006100519786457841326",
        verificationStatus: "APPROVED",
      },
    });
    const store = await prisma.store.create({
      data: {
        id: `${ad}s`,
        merchantId: merchant.id,
        name: `${ad} dükkânı`,
        address: "x",
        district: "Kadıköy",
        city: "İstanbul",
        latitude: 40.99,
        longitude: 29.03,
      },
    });
    const template = await prisma.bagTemplate.create({
      data: {
        id: `${ad}b`,
        storeId: store.id,
        title: `${ad} paketi`,
        category: "BAKERY",
        allergenDisclaimer: "x",
        priceCents: 1000,
        originalValueCentsMin: 3000,
        originalValueCentsMax: 4000,
      },
    });
    const offer = await prisma.dailyOffer.create({
      data: {
        id: `${ad}o`,
        bagTemplateId: template.id,
        storeId: store.id,
        offerDate: new Date("2026-08-27T00:00:00Z"),
        qtyTotal: 3,
        pickupStartAt: new Date("2026-08-27T16:00:00Z"),
        pickupEndAt: new Date("2026-08-27T18:00:00Z"),
        status: "PUBLISHED",
      },
    });
    const user = await prisma.user.create({
      data: { id: `${ad}u`, phoneE164: telefon },
    });
    const reservation = await prisma.reservation.create({
      data: {
        id: rezervasyonId,
        code: `K-${telefon.slice(-4)}`,
        userId: user.id,
        offerId: offer.id,
        storeId: store.id,
        qty: 1,
        unitPriceCents: 1000,
        totalCents: 1000,
        status: "CONFIRMED",
        cancelDeadlineAt: new Date("2026-08-27T15:58:00Z"),
      },
    });
    return { offer, reservation };
  }

  it("removes a reservation made THROUGH the demo, whose own id carries no demo prefix", async () => {
    await temizle();
    // The id shape a real purchase produces: nothing about it says "demo",
    // only what it points at does.
    const demo = await kur(
      PREFIX,
      "cmt0kullanimdanrezervasyon",
      "+905559990001",
    );
    const operator = await kur(OP, `${OP}r`, "+905559990002");

    await teardownDemo(prisma);

    expect(
      await prisma.reservation.findUnique({
        where: { id: demo.reservation.id },
      }),
    ).toBeNull();
    expect(
      await prisma.dailyOffer.findUnique({ where: { id: demo.offer.id } }),
    ).toBeNull();

    // …and the operator's own rows are untouched. This is the assertion
    // that makes the widened delete safe to ship.
    expect(
      await prisma.reservation.findUnique({
        where: { id: operator.reservation.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.dailyOffer.findUnique({ where: { id: operator.offer.id } }),
    ).not.toBeNull();
    expect(
      await prisma.merchant.findUnique({ where: { id: `${OP}m` } }),
    ).not.toBeNull();
  }, 60_000);

  it("is a safe no-op when there is nothing to remove", async () => {
    await teardownDemo(prisma);
    await expect(teardownDemo(prisma)).resolves.not.toThrow();
  }, 60_000);
});
