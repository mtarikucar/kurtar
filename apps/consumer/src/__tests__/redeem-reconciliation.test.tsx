import { act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

import { client } from "../lib/api-client";
import { renderHookWithProviders } from "../test-utils/render";
import { useRedeemReconciliation } from "../hooks/use-redeem-reconciliation";
import { RESERVATIONS_QUERY_KEY } from "../hooks/use-reservations";
import { getQueuedConfirmation } from "../lib/redeem-queue";
import { KurtarApiError } from "@kurtar/api-client";
import type { ReservationItem, ReservationListResponse } from "../lib/api-types";

const mockListMine = client.reservations.listMine as jest.Mock;

function reservation(overrides: Partial<ReservationItem>): ReservationItem {
  return {
    id: "resv-1",
    code: "AB12CD",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 4990,
    totalCents: 4990,
    status: "CONFIRMED",
    cancelDeadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function listResponse(item: ReservationItem): ReservationListResponse {
  return { items: [item], total: 1, page: 1, pageSize: 20 };
}

describe("useRedeemReconciliation — the defining redeem interaction's state machine", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("happy path: swipe queues locally, then reconciles once GET /reservations/mine reports REDEEMED", async () => {
    mockListMine.mockResolvedValueOnce(listResponse(reservation({ status: "CONFIRMED" })));

    const { result, queryClient } = await renderHookWithProviders(() =>
      useRedeemReconciliation("resv-1"),
    );

    await waitFor(() => expect(result.current.queueChecked).toBe(true));
    expect(result.current.queued).toBeNull();
    expect(result.current.reconciled).toBe(false);

    // The swipe — this is a LOCAL commit only (see redeem-queue.ts's doc
    // comment: the consumer can never call the merchant-only redeem
    // endpoint itself).
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.queued).not.toBeNull();

    // First poll (triggered by `enabled` flipping true) reports still
    // CONFIRMED — staff hasn't acted yet.
    await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(1));
    expect(result.current.reconciled).toBe(false);
    expect(result.current.isOffline).toBe(false);

    // Staff redeems it on their own device — the next poll observes it.
    mockListMine.mockResolvedValueOnce(
      listResponse(
        reservation({ status: "REDEEMED", redeemedAt: "2026-08-15T18:30:00.000Z" }),
      ),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    });

    await waitFor(() => expect(result.current.reconciled).toBe(true));
    expect(result.current.redeemedAt).toBe("2026-08-15T18:30:00.000Z");

    // The local queue entry is cleared once reconciled — nothing left to retry.
    expect(await getQueuedConfirmation("resv-1")).toBeNull();
  });

  it("offline-retry path: a failed poll shows the offline state, not a blank screen, and a later successful poll still reconciles", async () => {
    mockListMine.mockResolvedValueOnce(listResponse(reservation({ status: "CONFIRMED" })));

    const { result, queryClient } = await renderHookWithProviders(() =>
      useRedeemReconciliation("resv-1"),
    );
    await waitFor(() => expect(result.current.queueChecked).toBe(true));

    await act(async () => {
      await result.current.confirm();
    });
    await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(1));
    expect(result.current.isOffline).toBe(false);

    // Signal dies — the till-queue scenario the brief calls out by name.
    mockListMine.mockRejectedValueOnce(
      new KurtarApiError({
        statusCode: 0,
        errorCode: "NETWORK_ERROR",
        message: "Network request failed.",
        isBackendErrorCode: false,
      }),
    );
    await act(async () => {
      await queryClient
        .refetchQueries({ queryKey: RESERVATIONS_QUERY_KEY })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isOffline).toBe(true));
    // The queued confirmation survives a failed poll — still there to retry.
    expect(await getQueuedConfirmation("resv-1")).not.toBeNull();
    expect(result.current.reconciled).toBe(false);

    // Signal comes back — the SAME queued confirmation reconciles on retry,
    // with no user action required.
    mockListMine.mockResolvedValueOnce(
      listResponse(
        reservation({ status: "REDEEMED", redeemedAt: "2026-08-15T18:31:00.000Z" }),
      ),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: RESERVATIONS_QUERY_KEY });
    });

    await waitFor(() => expect(result.current.reconciled).toBe(true));
    expect(result.current.isOffline).toBe(false);
    expect(await getQueuedConfirmation("resv-1")).toBeNull();
  });

  it("does not poll at all before the user swipes", async () => {
    mockListMine.mockResolvedValue(listResponse(reservation({ status: "CONFIRMED" })));
    const { result } = await renderHookWithProviders(() => useRedeemReconciliation("resv-1"));
    await waitFor(() => expect(result.current.queueChecked).toBe(true));

    // Give any accidental eager fetch a chance to happen, then assert it didn't.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(mockListMine).not.toHaveBeenCalled();
  });
});
