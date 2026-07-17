// 区域親番ごとのポリゴン塗り分け（緑系数色を親番号の mod で割り当てる）。
// 仕様: docs/wants/03_地図機能.md「区域親番ごとのポリゴン塗り分け」

import { areaParentKey } from "./parent-boundary";

export interface ParentAreaColorPair {
  /** 非選択時（細線・薄塗り）の色 */
  base: string;
  /** 選択時（太線・濃塗り）の色 */
  selected: string;
}

/**
 * 紐付け済みポリゴンの緑系パレット。色0 は従来色（green）で、
 * 区域ID未解決時のフォールバックを兼ねる。
 * 紐付け有無の判別（緑系=紐付け済み/灰色=未紐付け）を保つため、
 * 全色を明確な緑〜黄緑系に限定し、青寄りの色相（teal 等）は含めない。
 */
export const PARENT_AREA_POLYGON_COLORS: readonly ParentAreaColorPair[] = [
  // 類似色（lime/moss）が連続インデックスに並ばない順序にする
  // （連番の親番は地理的に隣接しがちなため、隣接コントラストを優先）
  { base: "#22c55e", selected: "#166534" }, // green
  { base: "#84cc16", selected: "#4d7c0f" }, // lime
  { base: "#10b981", selected: "#065f46" }, // emerald
  { base: "#65a30d", selected: "#365314" }, // moss
];

/**
 * 区域ID（例: NRT-001-05）から色インデックスを決める。
 * 親番キー（NRT-001）末尾の数値を色数で mod する。数値が取れない
 * 識別子は文字コード和で代替し、必ずパレット範囲内に落とす。
 */
export function parentAreaColorIndex(areaId: string): number {
  const parent = areaParentKey(areaId);
  const m = /(\d+)\s*$/.exec(parent);
  if (m) {
    return parseInt(m[1], 10) % PARENT_AREA_POLYGON_COLORS.length;
  }
  let sum = 0;
  for (let i = 0; i < parent.length; i++) {
    sum = (sum + parent.charCodeAt(i)) % PARENT_AREA_POLYGON_COLORS.length;
  }
  return sum;
}

/** 区域IDに応じた色対を返す。未解決（undefined）は色0（従来の green）。 */
export function parentAreaColorPair(
  areaId: string | undefined,
): ParentAreaColorPair {
  if (!areaId) return PARENT_AREA_POLYGON_COLORS[0];
  return PARENT_AREA_POLYGON_COLORS[parentAreaColorIndex(areaId)];
}
