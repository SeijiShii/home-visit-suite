import { describe, expect, it } from "vitest";
import {
  type AvailablePeriod,
  availablePeriodIsActive,
  availablePeriodPhase,
  availablePeriodsOverlap,
  validateAvailablePeriod,
  validateAvailablePeriodTag,
} from "./available-period";

function period(overrides: Partial<AvailablePeriod> = {}): AvailablePeriod {
  return {
    id: "p1",
    name: "2026 春の活動",
    startDate: "2026-04-01T00:00:00Z",
    endDate: "2026-06-30T23:59:59Z",
    parentAreaIds: ["pa1"],
    tagIds: [],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

describe("validateAvailablePeriod", () => {
  it("正常な期間は null を返す", () => {
    expect(validateAvailablePeriod(period())).toBeNull();
  });

  it("名前が空ならエラー", () => {
    expect(validateAvailablePeriod(period({ name: "" }))).toMatch(/empty/);
  });

  it("名前が 100 文字を超えたらエラー", () => {
    expect(validateAvailablePeriod(period({ name: "あ".repeat(101) }))).toMatch(/100/);
    expect(validateAvailablePeriod(period({ name: "あ".repeat(100) }))).toBeNull();
  });

  it("endDate が startDate より前ならエラー", () => {
    const p = period({
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-05-01T00:00:00Z",
    });
    expect(validateAvailablePeriod(p)).toMatch(/before/);
  });

  it("startDate と endDate が同時刻なら正常（単日期間）", () => {
    const p = period({
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-01T00:00:00Z",
    });
    expect(validateAvailablePeriod(p)).toBeNull();
  });
});

describe("availablePeriodIsActive / availablePeriodPhase", () => {
  const p = period();

  it("開始前は inactive / pending", () => {
    const now = new Date("2026-03-31T23:59:59Z");
    expect(availablePeriodIsActive(p, now)).toBe(false);
    expect(availablePeriodPhase(p, now)).toBe("pending");
  });

  it("期間中は active", () => {
    const now = new Date("2026-05-15T12:00:00Z");
    expect(availablePeriodIsActive(p, now)).toBe(true);
    expect(availablePeriodPhase(p, now)).toBe("active");
  });

  it("境界（startDate / endDate ちょうど）は active（閉区間）", () => {
    expect(availablePeriodIsActive(p, new Date("2026-04-01T00:00:00Z"))).toBe(true);
    expect(availablePeriodIsActive(p, new Date("2026-06-30T23:59:59Z"))).toBe(true);
  });

  it("終了後は inactive / closed", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(availablePeriodIsActive(p, now)).toBe(false);
    expect(availablePeriodPhase(p, now)).toBe("closed");
  });
});

describe("availablePeriodsOverlap", () => {
  const a = period({
    startDate: "2026-04-01T00:00:00Z",
    endDate: "2026-04-30T00:00:00Z",
  });

  it("重複する期間は true", () => {
    const b = period({
      id: "p2",
      startDate: "2026-04-15T00:00:00Z",
      endDate: "2026-05-15T00:00:00Z",
    });
    expect(availablePeriodsOverlap(a, b)).toBe(true);
    expect(availablePeriodsOverlap(b, a)).toBe(true);
  });

  it("完全に離れた期間は false", () => {
    const b = period({
      id: "p2",
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T00:00:00Z",
    });
    expect(availablePeriodsOverlap(a, b)).toBe(false);
  });

  it("接する境界（endDate = startDate）も重複扱い", () => {
    const b = period({
      id: "p2",
      startDate: "2026-04-30T00:00:00Z",
      endDate: "2026-05-31T00:00:00Z",
    });
    expect(availablePeriodsOverlap(a, b)).toBe(true);
  });

  it("包含関係も重複扱い", () => {
    const b = period({
      id: "p2",
      startDate: "2026-04-10T00:00:00Z",
      endDate: "2026-04-20T00:00:00Z",
    });
    expect(availablePeriodsOverlap(a, b)).toBe(true);
  });
});

describe("validateAvailablePeriodTag", () => {
  it("正常なタグは null を返す", () => {
    expect(validateAvailablePeriodTag({ id: "t1", name: "春", color: "#3b82f6" })).toBeNull();
    expect(validateAvailablePeriodTag({ id: "t2", name: "特別", color: "" })).toBeNull();
  });

  it("名前が空・16 文字超・色形式不正はエラー", () => {
    expect(validateAvailablePeriodTag({ id: "t1", name: "", color: "" })).toMatch(/empty/);
    expect(
      validateAvailablePeriodTag({ id: "t1", name: "あ".repeat(17), color: "" }),
    ).toMatch(/16/);
    expect(validateAvailablePeriodTag({ id: "t1", name: "x", color: "blue" })).toMatch(/hex/);
  });
});
