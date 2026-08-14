import { BadRequestException } from "@nestjs/common";
import { validateStoreCoordinates } from "./store-geo.rules";

function errorCodeOf(fn: () => void): string {
  try {
    fn();
    throw new Error("expected to throw");
  } catch (err) {
    if (err instanceof BadRequestException) {
      return (err.getResponse() as { errorCode: string }).errorCode;
    }
    throw err;
  }
}

describe("validateStoreCoordinates", () => {
  it("accepts a real Istanbul coordinate", () => {
    expect(() => validateStoreCoordinates(40.9909, 29.0304)).not.toThrow();
  });

  it("accepts a real Diyarbakır (east) coordinate", () => {
    expect(() => validateStoreCoordinates(37.9144, 40.2306)).not.toThrow();
  });

  it("rejects physically invalid coordinates before the bbox check", () => {
    expect(errorCodeOf(() => validateStoreCoordinates(200, 29))).toBe(
      "STORE_COORDINATES_INVALID",
    );
  });

  it("rejects a coordinate west of Turkey (e.g. Athens)", () => {
    expect(errorCodeOf(() => validateStoreCoordinates(37.98, 23.72))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
  });

  it("rejects a coordinate east of Turkey (e.g. Baku)", () => {
    expect(errorCodeOf(() => validateStoreCoordinates(40.41, 49.87))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
  });

  it("rejects swapped lat/lng (a common client bug)", () => {
    // Istanbul's real lat/lng swapped lands well outside the bbox.
    expect(errorCodeOf(() => validateStoreCoordinates(29.0304, 40.9909))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
  });

  it("rejects exactly on the bbox boundary (exclusive bounds)", () => {
    expect(errorCodeOf(() => validateStoreCoordinates(35, 30))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
    expect(errorCodeOf(() => validateStoreCoordinates(43, 30))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
    expect(errorCodeOf(() => validateStoreCoordinates(40, 25))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
    expect(errorCodeOf(() => validateStoreCoordinates(40, 45))).toBe(
      "STORE_LOCATION_OUTSIDE_TURKEY",
    );
  });
});
