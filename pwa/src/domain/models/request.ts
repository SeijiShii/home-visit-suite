// 申請のドメインモデル。
// 仕様: docs/wants/07_通知と申請.md
// 参照実装: shared/domain/models/request.go

import type { Coordinate } from "./geometry";

/** 申請の種類。 */
export type RequestType =
  | "place_add" // 場所作成申請（活動メンバーが未登録地点を追加）
  | "place_info_modify" // 場所情報修正申請（既存場所の情報修正依頼）
  | "map_update" // 地図情報更新申請（廃屋・更地化・新築等）
  | "do_not_visit"; // 訪問拒否宅報告

/** 申請のステータス。 */
export type RequestStatus =
  | "pending" // 未処理
  | "on_hold" // 保留
  | "resolved"; // 処理済み

/** 活動メンバーからの申請。 */
export interface Request {
  id: string;
  type: RequestType;
  status: RequestStatus;
  /** 申請者 */
  submitterId: string;
  /** 対象区域 */
  areaId: string;
  /** 既存場所への申請対象（place_add は空） */
  placeId: string;
  /** 場所追加時の座標 */
  coord: Coordinate | null;
  description: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  resolvedAt: string | null;
  /** 処理した編集メンバー */
  resolvedBy: string;
}
