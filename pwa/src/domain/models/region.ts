// 領域・区域親番・区域のドメインモデル。
// 仕様: docs/wants/02_領域と区域.md
// 参照実装: shared/domain/models/region.go
// 識別子体系: 領域-区域親番-区域（例: NRT-001-05）

import type { GeoJSONPolygon } from "./geometry";

/** 活動領域（例: 成田市）。 */
export interface Region {
  id: string;
  /** 例: 成田市 */
  name: string;
  /** 例: NRT（2~4文字の英大文字） */
  symbol: string;
  /** 管理者による承認済みか */
  approved: boolean;
  /** 領域の境界ポリゴン */
  geometry: GeoJSONPolygon | null;
  /** 表示順（0始まり） */
  order: number;
  /** 論理削除タイムスタンプ（ISO 8601） */
  deletedAt?: string;
}

/** 区域親番（例: 加良部1丁目）。 */
export interface ParentArea {
  id: string;
  regionId: string;
  /** 例: "001" */
  number: string;
  /** 例: 加良部1丁目 */
  name: string;
  geometry: GeoJSONPolygon | null;
  deletedAt?: string;
}

/** 区域（運用上の最小単位）。1つの区域は50~100件程度の訪問先を含む。 */
export interface Area {
  id: string;
  parentAreaId: string;
  /** 例: "05" */
  number: string;
  /** map-polygon-editor のポリゴンID */
  polygonId?: string;
  geometry: GeoJSONPolygon | null;
  deletedAt?: string;
}

/** 区域の完全識別子を組み立てる。例: NRT-001-05 */
export function areaIdentifier(
  regionSymbol: string,
  parentNumber: string,
  areaNumber: string,
): string {
  return `${regionSymbol}-${parentNumber}-${areaNumber}`;
}

/** 表示用ラベルを組み立てる。例: NRT-001-05 加良部1丁目 */
export function areaDisplayLabel(
  regionSymbol: string,
  parentNumber: string,
  areaNumber: string,
  parentName: string,
): string {
  return `${areaIdentifier(regionSymbol, parentNumber, areaNumber)} ${parentName}`;
}
