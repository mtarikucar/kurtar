import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearQueuedConfirmation,
  getAllQueuedConfirmations,
  getQueuedConfirmation,
  queueLocalConfirmation,
} from "../lib/redeem-queue";

describe("redeem-queue — the offline-tolerant local confirmation queue", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns null for a reservation that was never queued", async () => {
    expect(await getQueuedConfirmation("resv-1")).toBeNull();
  });

  it("persists a swipe confirmation and can read it back", async () => {
    const entry = await queueLocalConfirmation("resv-1");
    expect(entry.reservationId).toBe("resv-1");
    expect(typeof entry.swipedAt).toBe("string");

    const read = await getQueuedConfirmation("resv-1");
    expect(read).toEqual(entry);
  });

  it("is idempotent — re-queuing the same reservation keeps the original swipedAt", async () => {
    const first = await queueLocalConfirmation("resv-1");
    // Advance real time a touch so a bug that DID reset the clock would
    // be observable in the timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await queueLocalConfirmation("resv-1");
    expect(second.swipedAt).toBe(first.swipedAt);
  });

  it("clears a queued confirmation once reconciled", async () => {
    await queueLocalConfirmation("resv-1");
    await clearQueuedConfirmation("resv-1");
    expect(await getQueuedConfirmation("resv-1")).toBeNull();
  });

  it("clearing a never-queued reservation is a safe no-op", async () => {
    await expect(clearQueuedConfirmation("never-queued")).resolves.toBeUndefined();
  });

  it("tracks multiple pending confirmations independently — the global sync path", async () => {
    await queueLocalConfirmation("resv-1");
    await queueLocalConfirmation("resv-2");
    const all = await getAllQueuedConfirmations();
    expect(all.map((e) => e.reservationId).sort()).toEqual(["resv-1", "resv-2"]);

    await clearQueuedConfirmation("resv-1");
    const remaining = await getAllQueuedConfirmations();
    expect(remaining.map((e) => e.reservationId)).toEqual(["resv-2"]);
  });
});
