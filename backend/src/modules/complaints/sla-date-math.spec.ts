import {
  addCalendarDays,
  computeComplaintSlaDeadline,
  COMPLAINT_SLA_DAYS,
} from "./sla-date-math";

describe("addCalendarDays", () => {
  it("adds a plain number of calendar days", () => {
    const start = new Date("2026-01-01T10:30:00.000Z");
    const result = addCalendarDays(start, 15);
    expect(result.toISOString()).toBe("2026-01-16T10:30:00.000Z");
  });

  it("crosses a month boundary correctly", () => {
    const start = new Date("2026-01-25T00:00:00.000Z");
    const result = addCalendarDays(start, 15);
    expect(result.toISOString()).toBe("2026-02-09T00:00:00.000Z");
  });

  it("crosses a year boundary correctly", () => {
    const start = new Date("2026-12-25T00:00:00.000Z");
    const result = addCalendarDays(start, 15);
    expect(result.toISOString()).toBe("2027-01-09T00:00:00.000Z");
  });

  it("does not mutate the input date", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const startCopy = new Date(start.getTime());
    addCalendarDays(start, 5);
    expect(start.getTime()).toBe(startCopy.getTime());
  });

  it("preserves the time-of-day component", () => {
    const start = new Date("2026-06-15T14:45:33.123Z");
    const result = addCalendarDays(start, 3);
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(45);
    expect(result.getUTCSeconds()).toBe(33);
  });
});

describe("computeComplaintSlaDeadline", () => {
  it("is exactly COMPLAINT_SLA_DAYS (15) calendar days from creation", () => {
    const createdAt = new Date("2026-03-01T09:00:00.000Z");
    const deadline = computeComplaintSlaDeadline(createdAt);
    expect(COMPLAINT_SLA_DAYS).toBe(15);
    expect(deadline.toISOString()).toBe("2026-03-16T09:00:00.000Z");
  });
});
