import { siparisKalanDakika, siparisPillDurumu } from "../lib/order-durum";

describe("siparisPillDurumu — an order's pickup window as a KepenkDurumu", () => {
  it("is 'acilmadi' before the pickup window opens", () => {
    const simdi = new Date("2026-08-19T15:00:00.000Z");
    const pickupStartAt = "2026-08-19T18:30:00.000Z";
    expect(siparisPillDurumu(simdi, pickupStartAt)).toBe("acilmadi");
  });

  it("is 'acik' once the pickup window has opened", () => {
    const simdi = new Date("2026-08-19T18:31:00.000Z");
    const pickupStartAt = "2026-08-19T18:30:00.000Z";
    expect(siparisPillDurumu(simdi, pickupStartAt)).toBe("acik");
  });

  it("is 'acik' exactly at the opening instant", () => {
    const pickupStartAt = "2026-08-19T18:30:00.000Z";
    expect(siparisPillDurumu(new Date(pickupStartAt), pickupStartAt)).toBe("acik");
  });
});

describe("siparisKalanDakika — floored, never negative", () => {
  it("counts down to the pickup end", () => {
    const simdi = new Date("2026-08-19T18:00:00.000Z");
    const pickupEndAt = "2026-08-19T19:26:00.000Z";
    expect(siparisKalanDakika(simdi, pickupEndAt)).toBe(86);
  });

  it("floors at zero once the window has closed, never goes negative", () => {
    const simdi = new Date("2026-08-19T20:00:00.000Z");
    const pickupEndAt = "2026-08-19T19:26:00.000Z";
    expect(siparisKalanDakika(simdi, pickupEndAt)).toBe(0);
  });
});
