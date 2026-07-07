// 場所のドメインモデル。
// 仕様: docs/wants/03_地図機能.md / 08_活動メンバー向けアプリ.md
// 参照実装: shared/domain/models/place.go

import type { Coordinate } from "./geometry";

/** 場所の種別。 */
export type PlaceType =
  | "house" // 戸建て
  | "building" // 集合住宅
  | "room"; // 部屋

/** 座標と紐づく「場所」モデル。 */
export interface Place {
  /** UUID */
  id: string;
  areaId: string;
  coord: Coordinate;
  type: PlaceType;
  /** 表札名等 */
  label: string;
  /** 部屋番号等の表示名（文字列） */
  displayName: string;
  /** 住所（任意、自由記述） */
  address: string;
  /** 集合住宅(building)用の補足情報。訪問記録ダイアログ起動時に内容ありなら上部に表示 */
  description: string;
  /** 集合住宅の場合、親建物のID */
  parentId: string;
  /** 並び順（編集メンバー変更可） */
  sortOrder: number;
  /** ISO 639-1コード */
  languages: string[];
  /** 訪問不可フラグ */
  doNotVisit: boolean;
  /** 訪問不可理由 */
  doNotVisitNote: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  /** 論理削除時刻（ISO 8601） */
  deletedAt?: string;
  /** 過去場所からの再生元 PlaceID */
  restoredFromId?: string;
}
