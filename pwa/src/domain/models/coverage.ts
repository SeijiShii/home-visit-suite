// 網羅活動のドメインモデル。
// 仕様: docs/wants/06_網羅管理.md
// 参照実装: shared/domain/models/coverage.go
//
// SchedulePeriod / Scope / AreaAvailability は 2026-05-06 仕様改訂で全廃され、
// AvailablePeriod に統合された。詳細は available-period.ts を参照。

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
