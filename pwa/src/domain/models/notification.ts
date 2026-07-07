// 通知のドメインモデル。
// 仕様: docs/wants/07_通知と申請.md
// 参照実装: shared/domain/models/notification.go

/** 通知の種別。 */
export type NotificationType =
  | "invitation" // 任命招待
  | "lending" // 区域の貸し出し
  | "area_invite" // 区域招待（被招待者向け、発行時のみ）
  | "return" // 返却
  | "force_return" // 強制回収
  | "request_result"; // 申請結果

export interface Notification {
  id: string;
  type: NotificationType;
  /** 宛先DID */
  targetId: string;
  /** 関連エンティティID */
  referenceId: string;
  message: string;
  read: boolean;
  /** ISO 8601 */
  createdAt: string;
  /** 表示期限（ISO 8601） */
  expiresAt: string | null;
}
