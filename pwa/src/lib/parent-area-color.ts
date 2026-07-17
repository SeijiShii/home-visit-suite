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
 * 紐付け済みポリゴンの有彩色パレット。色0 は従来色（green）で、
 * 区域ID未解決時のフォールバックを兼ねる。
 * 紐付け有無は無彩色（灰色=未紐付け）/有彩色（=紐付け済み）で判別する
 * ため、全色相を使える。無彩色・低彩度の色は灰色と紛れるため含めない。
 */
export const PARENT_AREA_POLYGON_COLORS: readonly ParentAreaColorPair[] = [
  // 連続インデックスが色相環上で離れる順序にする。mod 割り当てでは
  // 末尾→先頭（色7→色0）の折り返しも連番親番の隣接対になるため、
  // 折り返しを含めて隣接距離を確保する配置
  // （連番の親番は地理的に隣接しがちなため、隣接コントラストを優先）
  { base: "#22c55e", selected: "#166534" }, // green
  { base: "#3b82f6", selected: "#1e40af" }, // blue
  { base: "#f59e0b", selected: "#92400e" }, // amber
  { base: "#14b8a6", selected: "#115e59" }, // teal
  { base: "#84cc16", selected: "#4d7c0f" }, // lime
  { base: "#06b6d4", selected: "#155e75" }, // cyan
  { base: "#ec4899", selected: "#9d174d" }, // rose
  { base: "#a855f7", selected: "#6b21a8" }, // purple
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
