import { MERCHANT_OID_PREFIX, generateMerchantOid } from "./merchant-oid.util";

describe("generateMerchantOid", () => {
  it("starts with the KRV prefix", () => {
    expect(generateMerchantOid("clx123abc")).toMatch(
      new RegExp(`^${MERCHANT_OID_PREFIX}`),
    );
  });

  it("is deterministically influenced by the reservationId (used for grouping in log triage)", () => {
    const oid = generateMerchantOid("clxReservationId123");
    expect(oid).toContain("clxReservationId1".slice(0, 12));
  });

  it("strips non-alphanumeric characters from the reservationId fragment", () => {
    const oid = generateMerchantOid("cl-x_123!!!");
    expect(oid).not.toMatch(/[-_!]/);
  });

  it("produces distinct values across calls even for the same reservationId (timestamp+random suffix)", () => {
    const first = generateMerchantOid("same-id");
    const second = generateMerchantOid("same-id");
    expect(first).not.toBe(second);
  });
});
