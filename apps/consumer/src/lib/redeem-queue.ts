import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The offline-tolerant FALLBACK half of the redeem screen (task brief: "a
 * merchant's till queue is exactly where signal dies"). The PRIMARY path
 * is a direct `POST /reservations/:id/redeem` call from the consumer's own
 * phone (`@Actors("CONSUMER", "MERCHANT")` — see
 * backend/src/modules/reservations/reservations.controller.ts and
 * .service.ts's `redeem()` doc comment for the approved product design,
 * plan §4.6). This queue only exists for when that call can't even reach
 * the server: offline, DNS failure, a dead signal bar at the counter. In
 * that case the consumer's own swipe — the physical "I am here, showing
 * this to staff" gesture — is the only thing durable to persist locally,
 * since no server transaction happened yet. That local swipe is queued
 * here and reconciled by polling `GET /reservations/mine` (the one
 * consumer-reachable read) in the background until the reservation's
 * status flips to REDEEMED — by staff acting on their side (a manual
 * redeem from the merchant-web pickup list). Nothing in this app retries
 * the direct call once it's queued; the poll only ever reads, it never
 * re-POSTs. A queued swipe that never gets a signal bar again is a real
 * dead end until staff or an operator acts (tracked in
 * docs/launch-checklist.md's deferred-minor items). See
 * hooks/use-redeem-reconciliation.ts for the full confirm/poll logic and
 * src/app/redeem/[id].tsx's doc comment for the screen's state-machine
 * writeup; this file only owns the durable queue.
 */
export interface QueuedRedeemConfirmation {
  reservationId: string;
  swipedAt: string;
}

const QUEUE_KEY = "kurtar.redeemQueue";

type QueueMap = Record<string, QueuedRedeemConfirmation>;

async function readQueue(): Promise<QueueMap> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as QueueMap;
  } catch {
    return {};
  }
}

async function writeQueue(queue: QueueMap): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function queueLocalConfirmation(
  reservationId: string,
): Promise<QueuedRedeemConfirmation> {
  const queue = await readQueue();
  const existing = queue[reservationId];
  if (existing) return existing; // swipe is idempotent — don't reset the clock on a re-open
  const entry: QueuedRedeemConfirmation = {
    reservationId,
    swipedAt: new Date().toISOString(),
  };
  queue[reservationId] = entry;
  await writeQueue(queue);
  return entry;
}

export async function getQueuedConfirmation(
  reservationId: string,
): Promise<QueuedRedeemConfirmation | null> {
  const queue = await readQueue();
  return queue[reservationId] ?? null;
}

export async function clearQueuedConfirmation(
  reservationId: string,
): Promise<void> {
  const queue = await readQueue();
  if (!(reservationId in queue)) return;
  delete queue[reservationId];
  await writeQueue(queue);
}

export async function getAllQueuedConfirmations(): Promise<
  QueuedRedeemConfirmation[]
> {
  const queue = await readQueue();
  return Object.values(queue);
}
