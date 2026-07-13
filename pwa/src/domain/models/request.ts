// 申請のドメインモデル。
// 仕様: docs/wants/07_通知と申請.md
// 参照実装: shared/domain/models/request.go

import type { Coordinate } from "./geometry";

/**
 * 申請の種類。
 * 編集リクエストダイアログの種別（要削除/要移動/その他）は
 * place_delete / place_move / place_info_modify に対応する。
 */
export type RequestType =
  | "place_delete" // 場所削除申請（要削除。一般スタッフは直接削除不可のため申請）
  | "place_move" // 場所移動申請（要移動。位置ずれの是正依頼。直接移動不可のため申請）
  | "place_info_modify" // 場所情報修正申請（その他。既存場所の情報修正依頼）
  | "map_update" // 地図情報更新申請（廃屋・更地化・新築等）
  | "do_not_visit"; // 訪問拒否宅報告
// 旧 place_add（場所作成申請）は廃止（追加を直接作成に切替。docs/wants/07_通知と申請.md）

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
  /** 対象区域（タスク一覧から編集画面への遷移先の区域） */
  areaId: string;
  /**
   * 編集対象の場所 ID。編集リクエスト（place_delete / place_move /
   * place_info_modify）で必須。areaId と併せてタスク一覧から当該場所の
   * 編集画面へ遷移するためのキーとなる。
   */
  placeId: string;
  /** 座標（現状の申請種別では未使用。将来の座標付き申請用に保持） */
  coord: Coordinate | null;
  description: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  resolvedAt: string | null;
  /** 処理した編集メンバー */
  resolvedBy: string;
}
