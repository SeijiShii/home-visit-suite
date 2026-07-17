// フィードバックのドメインモデル。
// 仕様: docs/wants/07_通知と申請.md「フィードバック」

/** フィードバックの種別。 */
export type FeedbackKind =
  | "bug_report" // バグ報告
  | "encouragement" // 応援メッセージ
  | "other"; // その他

/** 管理者宛フィードバックのステータス（2 値。requests の 3 値より簡素）。 */
export type FeedbackStatus =
  | "pending" // 未処理
  | "resolved"; // 処理済み

/**
 * グループ管理者宛フィードバック（feedback 同期テーブルの行）。
 * requests と同様に ScopeNetwork で全メンバーへ同期され、表示のみ管理者に
 * ゲートする（秘匿ではない）。開発者宛フィードバックはこのテーブルを使わず、
 * 封緘 deposit で送る（lib/feedback-mailbox.ts）。
 */
export interface Feedback {
  id: string;
  kind: FeedbackKind;
  body: string;
  /** 送信者（DID） */
  senderId: string;
  /** ISO 8601 */
  createdAt: string;
  status: FeedbackStatus;
  /** ISO 8601（処理済みのみ） */
  resolvedAt: string | null;
  /** 処理した管理者 */
  resolvedBy: string;
}
