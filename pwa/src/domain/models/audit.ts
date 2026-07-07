// 監査ログのドメインモデル。
// 仕様: docs/wants/07_通知と申請.md
// 参照実装: shared/domain/models/audit.go

/** 監査対象の操作種別。 */
export type AuditAction =
  | "role_change"
  | "area_edit"
  | "approval"
  | "do_not_visit"
  | "force_return";

/** 重要操作の履歴。 */
export interface AuditLog {
  id: string;
  /** 所属領域（GroupShareのtopic） */
  regionId: string;
  action: AuditAction;
  /** 操作者 */
  actorId: string;
  /** 操作対象 */
  targetId: string;
  detail: string;
  /** ISO 8601 */
  timestamp: string;
  /** ISO 8601 */
  createdAt: string;
}
