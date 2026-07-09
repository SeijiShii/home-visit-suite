// AI 取込の未確定場所（PendingImportPlace）の永続化インターフェース。
// ポリゴン紐付け後の Place 取込までの一時保持に使う（docs/wants/03 Phase 1.1）。

import type { PendingImportPlace } from "../models/pending-import-place";

export interface PendingImportPlaceRepository {
  /** 未確定場所をまとめて保存する。 */
  saveMany(places: readonly PendingImportPlace[]): Promise<void>;
  /** 指定ポリゴンに束ねられた未確定場所を返す。 */
  listByPolygon(polygonId: string): Promise<PendingImportPlace[]>;
  /** 指定ポリゴンの未確定場所件数を返す。 */
  countByPolygon(polygonId: string): Promise<number>;
  /** 指定ポリゴンの未確定場所を全消去する（取込完了・ポリゴン削除時）。 */
  deleteByPolygon(polygonId: string): Promise<void>;
}
