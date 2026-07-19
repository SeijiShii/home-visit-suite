import { describe, expect, it } from "vitest";
import {
  FULL_SYNC_INTERVAL_MS,
  FullSyncSchedule,
  REPAIR_COOLDOWN_MS,
} from "./full-sync-schedule";

describe("FullSyncSchedule", () => {
  it("初回 tick は未実行のため即実行する（起動時完全 catch-up）", () => {
    const s = new FullSyncSchedule();
    expect(s.shouldRunOnTick(1_000)).toBe(true);
  });

  it("markRun 後は間隔経過まで tick では実行しない", () => {
    const s = new FullSyncSchedule();
    s.markRun(1_000);
    expect(s.shouldRunOnTick(1_000 + FULL_SYNC_INTERVAL_MS - 1)).toBe(false);
    expect(s.shouldRunOnTick(1_000 + FULL_SYNC_INTERVAL_MS)).toBe(true);
  });

  it("リペア要求は未実行なら即実行する", () => {
    const s = new FullSyncSchedule();
    expect(s.shouldRunOnRepair(1_000)).toBe(true);
  });

  it("リペア要求はクールダウン内なら実行しない（画面ロード毎の連打防止）", () => {
    const s = new FullSyncSchedule();
    s.markRun(1_000);
    expect(s.shouldRunOnRepair(1_000 + REPAIR_COOLDOWN_MS - 1)).toBe(false);
    expect(s.shouldRunOnRepair(1_000 + REPAIR_COOLDOWN_MS)).toBe(true);
  });

  it("リペア実行の markRun は定期実行のタイマーも先送りする（同一の実行記録を共有）", () => {
    const s = new FullSyncSchedule();
    s.markRun(1_000);
    s.markRun(2_000); // リペアで再実行された
    expect(s.shouldRunOnTick(1_000 + FULL_SYNC_INTERVAL_MS)).toBe(false);
    expect(s.shouldRunOnTick(2_000 + FULL_SYNC_INTERVAL_MS)).toBe(true);
  });
});
