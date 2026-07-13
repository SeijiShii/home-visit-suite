// 網羅活動のドメインモデル。
// 仕様: docs/wants/06_網羅管理.md
// 参照実装: shared/domain/models/coverage.go
//
// SchedulePeriod / Scope / AreaAvailability は 2026-05-06 に AvailablePeriod へ統合され、
// その AvailablePeriod（チェックアウト可能期間）も 2026-07-13 に廃止された。
// チェックアウトのゲートは排他制約のみ、網羅進捗は全期間集計（docs/wants/05・06 参照）。

/** 網羅活動のステータス。 */
export type CoverageStatus = "planned" | "active" | "completed";

/** 区域親番単位の網羅活動データ。 */
export interface Coverage {
  id: string;
  parentAreaId: string;
  status: CoverageStatus;
  /** 実体完了パーセンテージ */
  actualPercent: number;
  /** ステータス上の完了パーセンテージ */
  statusPercent: number;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}
