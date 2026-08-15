import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The offline-tolerant half of the redeem screen (task brief: "a
 * merchant's till queue is exactly where signal dies"). Redemption itself
 * is authorized server-side ONLY by merchant staff (`POST
 * /reservations/:id/redeem` is `@Actors("MERCHANT")` — see
 * backend/src/modules/reservations/reservations.controller.ts; there is no
 * consumer-callable redeem endpoint, by design: a self-serve consumer
 * redeem would be trivially exploitable, and the controller's own comment
 * confirms this is "staff scan at the counter", not the app itself). So
 * what THIS app can reliably persist is the consumer's own swipe — the
 * physical "I am here, showing this to staff" gesture — not a completed
 * server transaction. That local swipe is queued here and reconciled by
 * polling `GET /reservations/mine` (the one consumer-reachable read) in
 * the background until the reservation's status flips to REDEEMED, which
 * is what staff's own action on their side produces. See
 * hooks/use-redeem-reconciliation.ts for the poll loop and
 * src/app/redeem/[id].tsx's doc comment for the full state-machine
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
