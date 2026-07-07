// 訪問記録・チェックアウトのドメインモデル。
// 仕様: docs/wants/05_チェックアウト.md / 08_活動メンバー向けアプリ.md
// 参照実装: shared/domain/models/visit.go

import type { Coordinate } from "./geometry";

/** 訪問結果。 */
export type VisitResult =
  | "met" // 会えた
  | "absent" // 留守
  | "vacant_possible" // 空き家（入居の可能性あり）
  | "vacant_abandoned" // 空き家（廃屋）または更地
  | "refused"; // 訪問を望まない

/**
 * 当該ステータス選択時に申請（テキスト入力 + 編集メンバータスク化）を伴うかを返す。
 * 空き家（廃屋）または更地 → 地図情報更新申請
 * 訪問を望まない → 訪問拒否宅報告
 */
export function visitResultRequiresApplication(result: VisitResult): boolean {
  return result === "vacant_abandoned" || result === "refused";
}

/**
 * 活動メンバーの訪問記録。
 * 個人メモ（Note）はDeviceDBのPersonalNoteに移動済み。
 */
export interface VisitRecord {
  id: string;
  /** 記録した活動メンバー */
  userId: string;
  /** 空文字可: 場所モデルへの参照 */
  placeId: string;
  /** null可: 場所未登録地点 */
  coord: Coordinate | null;
  /** 活動中の区域 */
  areaId: string;
  /** どのチェックアウトでの記録か（Phase 1 暫定では空文字許容、本実装で NOT NULL） */
  checkoutId: string;
  result: VisitResult;
  /** 申請を伴うステータス時の Request 参照 */
  appliedRequestId: string | null;
  /** ISO 8601 */
  visitedAt: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** チェックアウトのステータス。 */
export type CheckoutStatus =
  | "pending" // 開始前
  | "active" // 活動中
  | "returned" // 返却済み
  | "complete" // 完了
  | "force_closed"; // 期間終了による強制クローズ

/**
 * 1つの区域の取得・使用記録。
 * 同一区域に対してアクティブなチェックアウトは最大1つ（排他的取得）。
 *
 * 「貸し出し」「持ち出し」の操作経路区別は廃止済み（2026-05-06 仕様改訂）。
 * 統一して「チェックアウト」と呼称し、誰がチェックアウト操作したか・誰が担当するかを記録するのみ。
 *
 * 仕様: docs/wants/05_チェックアウト.md「区域の取得（チェックアウト）モデル」
 */
export interface Checkout {
  id: string;
  areaId: string;
  /** 親 AvailablePeriod（NOT NULL） */
  availablePeriodId: string;
  /** 担当者（実際に区域を使用する人） */
  personInChargeId: string;
  /** チェックアウト操作実行者（履歴として保持、担当者変更でも変えない） */
  checkedOutById: string;
  status: CheckoutStatus;
  /** ISO 8601 */
  createdAt: string;
  /** 返却日時（ISO 8601） */
  returnedAt: string | null;
  /** 完了日時（ISO 8601） */
  completedAt: string | null;
  /** 期間終了による強制クローズ日時（ISO 8601） */
  forceClosedAt: string | null;
  /** ISO 8601 */
  updatedAt: string;
}
