import { waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");
jest.mock("../lib/location");

import { client } from "../lib/api-client";
import * as location from "../lib/location";
import { renderHookWithProviders } from "../test-utils/render";
import { useEffectiveLocation } from "../hooks/use-effective-location";

const mockUpdateLocation = client.account.updateLocation as jest.Mock;
const mockGetPermissionState = location.getLocationPermissionState as jest.Mock;
const mockGetCurrentLatLng = location.getCurrentLatLng as jest.Mock;

describe("useEffectiveLocation — POST /me/location side effect (I7)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockUpdateLocation.mockResolvedValue(undefined);
  });

  it("reports the resolved GPS coordinates to the backend once granted", async () => {
    mockGetPermissionState.mockResolvedValue("granted");
    mockGetCurrentLatLng.mockResolvedValue({ lat: 41.01, lng: 29.02 });

    const { result } = await renderHookWithProviders(() => useEffectiveLocation());

    await waitFor(() => expect(result.current.coords).toEqual({ lat: 41.01, lng: 29.02 }));
    // Without I7's fix, nothing ever calls this — the OFFER_NEARBY push
    // audience stays permanently empty (lastLat/lastLng NULL forever).
    await waitFor(() =>
      expect(mockUpdateLocation).toHaveBeenCalledWith({ lat: 41.01, lng: 29.02 }),
    );
  });

  it("does not post when permission is denied", async () => {
    mockGetPermissionState.mockResolvedValue("denied");

    const { result } = await renderHookWithProviders(() => useEffectiveLocation());

    await waitFor(() => expect(result.current.denied).toBe(true));
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it("throttles a second post within the window instead of posting on every mount", async () => {
    mockGetPermissionState.mockResolvedValue("granted");
    mockGetCurrentLatLng.mockResolvedValue({ lat: 41.01, lng: 29.02 });

    // First mount (e.g. Discover) posts.
    await renderHookWithProviders(() => useEffectiveLocation());
    await waitFor(() => expect(mockUpdateLocation).toHaveBeenCalledTimes(1));

    // Second mount in the same app open (e.g. Search, mounted moments
    // later) must not double-post.
    const { result: second } = await renderHookWithProviders(() => useEffectiveLocation());
    await waitFor(() => expect(second.current.coords).toEqual({ lat: 41.01, lng: 29.02 }));
    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
  });

  it("never throws to the caller when the POST fails", async () => {
    mockGetPermissionState.mockResolvedValue("granted");
    mockGetCurrentLatLng.mockResolvedValue({ lat: 41.01, lng: 29.02 });
    mockUpdateLocation.mockRejectedValue(new Error("network down"));

    const { result } = await renderHookWithProviders(() => useEffectiveLocation());

    await waitFor(() => expect(result.current.coords).toEqual({ lat: 41.01, lng: 29.02 }));
    await waitFor(() => expect(mockUpdateLocation).toHaveBeenCalledTimes(1));
  });
});
