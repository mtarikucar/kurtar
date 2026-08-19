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
const mockRedeem = client.reservations.redeem as jest.Mock;

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
    // [I9 fix] The pickup window now comes off the reservation itself —
    // GET /reservations/mine joins the offer's window, so no screen has
    // to reconstruct it from cancelDeadlineAt any more.
    pickupStartAt: new Date(Date.now() + 3600_000 + 7_200_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 3600_000 + 7_200_000 + 5_400_000).toISOString(),
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

  it("happy path: swipe calls POST /reservations/:id/redeem directly and reconciles immediately, with no local queue and no polling", async () => {
    mockRedeem.mockResolvedValueOnce({
      reservationId: "resv-1",
      status: "REDEEMED",
      redeemedAt: "2026-08-15T18:30:00.000Z",
    });

    const { result } = await renderHookWithProviders(() =>
      useRedeemReconciliation("resv-1"),
    );

    await waitFor(() => expect(result.current.queueChecked).toBe(true));
    expect(result.current.queued).toBeNull();
    expect(result.current.reconciled).toBe(false);

    await act(async () => {
      await result.current.confirm();
    });

    expect(mockRedeem).toHaveBeenCalledWith("resv-1");
    expect(result.current.reconciled).toBe(true);
    expect(result.current.redeemedAt).toBe("2026-08-15T18:30:00.000Z");
    // Never fell back to the offline queue — a real server round trip
    // succeeded, so there was never anything to poll for.
    expect(result.current.queued).toBeNull();
    expect(mockListMine).not.toHaveBeenCalled();
    expect(await getQueuedConfirmation("resv-1")).toBeNull();
  });

  it("a real server rejection (e.g. outside the pickup window) is surfaced to the caller and never queued", async () => {
    mockRedeem.mockRejectedValueOnce(
      new KurtarApiError({
        statusCode: 409,
        errorCode: "RESERVATION_NOT_REDEEMABLE",
        message: "This reservation cannot be redeemed right now.",
        isBackendErrorCode: true,
      }),
    );

    const { result } = await renderHookWithProviders(() =>
      useRedeemReconciliation("resv-1"),
    );
    await waitFor(() => expect(result.current.queueChecked).toBe(true));

    await expect(
      act(async () => {
        await result.current.confirm();
      }),
    ).rejects.toThrow("This reservation cannot be redeemed right now.");

    // A real rejection is not a connectivity problem — nothing queued,
    // nothing polled (queuing a rejection the server will keep rejecting
    // would just hide it, not fix it).
    expect(result.current.queued).toBeNull();
    expect(result.current.reconciled).toBe(false);
    expect(mockListMine).not.toHaveBeenCalled();
  });

  it("offline fallback: a network failure on the direct call queues the swipe locally and reconciles once GET /reservations/mine reports REDEEMED", async () => {
    mockRedeem.mockRejectedValueOnce(
      new KurtarApiError({
        statusCode: 0,
        errorCode: "NETWORK_ERROR",
        message: "Network request failed.",
        isBackendErrorCode: false,
      }),
    );
    mockListMine.mockResolvedValueOnce(listResponse(reservation({ status: "CONFIRMED" })));

    const { result, queryClient } = await renderHookWithProviders(() =>
      useRedeemReconciliation("resv-1"),
    );
    await waitFor(() => expect(result.current.queueChecked).toBe(true));

    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.queued).not.toBeNull();
    expect(result.current.reconciled).toBe(false);

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
    mockRedeem.mockRejectedValueOnce(
      new KurtarApiError({
        statusCode: 0,
        errorCode: "NETWORK_ERROR",
        message: "Network request failed.",
        isBackendErrorCode: false,
      }),
    );
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

  it("stops polling once the reservation is swept to NO_SHOW — a queued swipe nobody reconciled is a dead end, not a forever-poll", async () => {
    // Until the backend's no-show sweep existed, an unreconciled queued
    // swipe stayed CONFIRMED for ever and this hook polled for ever with
    // it. NO_SHOW is the terminal answer it never used to get.
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    try {
      mockRedeem.mockRejectedValueOnce(
        new KurtarApiError({
          statusCode: 0,
          errorCode: "NETWORK_ERROR",
          message: "Network request failed.",
          isBackendErrorCode: false,
        }),
      );
      mockListMine.mockResolvedValue(
        listResponse(reservation({ status: "NO_SHOW", redeemedAt: null })),
      );

      const { result } = await renderHookWithProviders(() =>
        useRedeemReconciliation("resv-1"),
      );
      await waitFor(() => expect(result.current.queueChecked).toBe(true));
      await act(async () => {
        await result.current.confirm();
      });

      await waitFor(() => expect(mockListMine).toHaveBeenCalledTimes(1));
      expect(result.current.reconciled).toBe(false);

      // Several poll intervals' worth of time passes, and the read is not
      // repeated: the status can no longer change.
      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });
      expect(mockListMine).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
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
    expect(mockRedeem).not.toHaveBeenCalled();
  });
});
