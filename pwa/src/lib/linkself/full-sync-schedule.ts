// 完全 catch-up（アンチエントロピー）の実行判定（docs/wants/01
// 「同期完全性の補完＝完全 catch-up（アンチエントロピー）」）。
// 差分 catch-up は高水位（保持行の最大タイムスタンプ）の下に埋まった
// 取りこぼし行を二度と要求できないため、全チャネル since=0 の完全 catch-up を
// (a) 起動時 (b) 定期 (c) 不整合検出リペア時 に回して欠落を治癒させる。
// 判定だけの純ロジック（タイマー・イベント購読は linkself-services が担う）。

/** 定期実行の間隔。60 秒ポーリングの約 10 回に 1 回。 */
export const FULL_SYNC_INTERVAL_MS = 10 * 60_000;

/**
 * リペア要求（サニタイズの不整合検出）のクールダウン。破綻したままの
 * 画面が再ロードのたびにリペアを連打しないための下限間隔。
 */
export const REPAIR_COOLDOWN_MS = 60_000;

export class FullSyncSchedule {
  private lastRunAt: number | null = null;

  /** 60 秒ポーリングの tick 毎に呼ぶ。true なら完全 catch-up を実行する。 */
  shouldRunOnTick(now: number): boolean {
    return this.lastRunAt == null || now - this.lastRunAt >= FULL_SYNC_INTERVAL_MS;
  }

  /** 不整合検出のリペア要求時に呼ぶ。クールダウン内なら false。 */
  shouldRunOnRepair(now: number): boolean {
    return this.lastRunAt == null || now - this.lastRunAt >= REPAIR_COOLDOWN_MS;
  }

  /** 完全 catch-up を実際に送ったら呼ぶ（定期・リペアで実行記録を共有する）。 */
  markRun(now: number): void {
    this.lastRunAt = now;
  }
}
