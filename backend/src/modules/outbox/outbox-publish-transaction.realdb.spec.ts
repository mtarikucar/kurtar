import { PrismaClient } from "@prisma/client";
import { OutboxService } from "./outbox.service";

/**
 * Real-DB proof of OutboxService.publish's Important-3 fix: a duplicate
 * idempotencyKey (P2002) propagates out of publish() and aborts the
 * WHOLE enclosing Postgres transaction — never a silent partial commit.
 * A mocked `tx` (outbox.service.spec.ts) can prove the JS-level contract
 * (the error propagates) but structurally cannot reproduce Postgres's
 * real aborted-transaction semantics, which is exactly the footgun the
 * previous version of this method fell into (catching P2002 and
 * continuing inside the SAME transaction — see reservations.service.ts's
 * createReservationWithRetry doc comment for the identical failure mode
 * fixed once already in this codebase, and outbox.service.ts's own doc
 * comment for the full explanation). Only runs when TEST_DATABASE_URL is
 * set.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const d = TEST_DATABASE_URL ? describe : describe.skip;

const PHONE_PREFIX = "+9055519";

async function safeCleanup(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[outbox-publish-transaction.realdb.spec.ts cleanup] ${label} failed: ${(err as Error).message}`,
    );
  }
}

d("OutboxService.publish — real transaction abort semantics", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL! } },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await safeCleanup("user", () =>
      prisma.user.deleteMany({
        where: { phoneE164: { startsWith: PHONE_PREFIX } },
      }),
    );
    await safeCleanup("outboxEvent", () =>
      prisma.outboxEvent.deleteMany({
        where: { idempotencyKey: "outbox-publish-realdb-dup-key" },
      }),
    );
    await prisma.$disconnect();
  });

  it("a duplicate idempotencyKey rolls back the ENTIRE transaction, including unrelated prior statements in it — never a silent partial commit", async () => {
    const outbox = new OutboxService();
    const dupeKey = "outbox-publish-realdb-dup-key";
    const phone = `${PHONE_PREFIX}00001`;

    // Pre-seed a row already holding this idempotencyKey, so the
    // transaction below's publish() call genuinely collides against real
    // Postgres.
    await prisma.outboxEvent.create({
      data: { type: "test.dup.v1", payload: {}, idempotencyKey: dupeKey },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        // An unrelated, otherwise-valid statement earlier in the SAME
        // transaction — this is what must NOT silently commit.
        await tx.user.create({ data: { phoneE164: phone } });
        await outbox.publish(tx, {
          type: "test.dup.v1" as any,
          payload: {},
          idempotencyKey: dupeKey,
        });
      }),
    ).rejects.toThrow();

    // Proof the WHOLE transaction rolled back, not just the outbox
    // insert: the user created earlier in the same transaction must not
    // exist.
    const found = await prisma.user.findFirst({
      where: { phoneE164: phone },
    });
    expect(found).toBeNull();

    // And exactly one outbox_events row exists for this key (the
    // pre-seeded one) — the colliding insert never left a second row.
    const count = await prisma.outboxEvent.count({
      where: { idempotencyKey: dupeKey },
    });
    expect(count).toBe(1);
  }, 15_000);
});
