import { describe, it, expect } from "vitest";
import { lastVisitColorClass } from "./visit-date-color";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe("lastVisitColorClass", () => {
  it("returns empty string for null", () => {
    expect(lastVisitColorClass(null)).toBe("");
  });

  it("returns 'last-met-recent' for within 1 month (<=30 days)", () => {
    expect(lastVisitColorClass(daysAgo(0))).toBe("last-met-recent");
    expect(lastVisitColorClass(daysAgo(30))).toBe("last-met-recent");
  });

  it("returns 'last-met-mid' for within 6 months (31-182 days)", () => {
    expect(lastVisitColorClass(daysAgo(31))).toBe("last-met-mid");
    expect(lastVisitColorClass(daysAgo(182))).toBe("last-met-mid");
  });

  it("returns 'last-met-old' for older than 6 months (>182 days)", () => {
    expect(lastVisitColorClass(daysAgo(183))).toBe("last-met-old");
    expect(lastVisitColorClass(daysAgo(365))).toBe("last-met-old");
  });
});
