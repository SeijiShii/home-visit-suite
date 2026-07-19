// 区域に紐付いたまま残った無効ポリゴン ID の検出（修復スキャン）純ロジック。
// 仕様: docs/wants/03「区域紐付けの無効ポリゴン ID 修復」。
// 過去の不具合（頂点マージ未対応による破綻）の副作用で、削除済み・面積ほぼ 0 の
// ポリゴン ID が区域に紐付いたまま残ることがある。地図画面ロード時にスキャンし、
// 該当の紐付きを解除する（解除の実行は呼び出し側）。

import type { Polygon } from "geojson";
import type { AreaTreeNode } from "../services/region-service";

export interface StaleBinding {
  areaId: string;
  polygonId: string;
  /**
   * missing: エディタにポリゴンが存在しない。**P2P 同期の未着と削除済みを
   * 区別できない**ため、これを根拠にした紐付き解除は共有ストアへ伝播させて
   * はならない（部分同期中の端末が他端末の正当な紐付けを全消去する。
   * docs/wants/03「区域紐付けの無効ポリゴン ID 修復」の誤解除保護）。
   * degenerate: ポリゴンは存在するが外周面積がほぼ 0（破綻の名残・実データで
   * 確認できるため伝播する解除の対象にしてよい）。
   */
  reason: "missing" | "degenerate";
}

/**
 * 面積のほぼ 0 判定の既定しきい値（度²）。map-polygon-editor の面列挙が
 * ゼロ面積として面を落とすしきい値（1e-10 度² ≒ 約 1.2 m²）と揃える。
 */
export const MIN_POLYGON_AREA_DEG2 = 1e-10;

/** GeoJSON リング（[lng, lat] 列）の面積（度²、shoelace の絶対値）。 */
function ringAreaDeg2(ring: ReadonlyArray<ReadonlyArray<number>>): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * 区域ツリーの全紐付きポリゴン ID を走査し、無効なもの（エディタに存在しない、
 * または外周面積がほぼ 0）を返す。
 */
export function findStaleBindings(
  tree: AreaTreeNode[],
  getPolygonGeoJSON: (polygonId: string) => Polygon | null,
  minAreaDeg2: number = MIN_POLYGON_AREA_DEG2,
): StaleBinding[] {
  const stale: StaleBinding[] = [];
  for (const region of tree) {
    for (const pa of region.parentAreas) {
      for (const area of pa.areas) {
        for (const polygonId of area.polygonIds ?? []) {
          const geo = getPolygonGeoJSON(polygonId);
          const outer = geo?.coordinates?.[0];
          if (!outer) {
            stale.push({ areaId: area.id, polygonId, reason: "missing" });
          } else if (ringAreaDeg2(outer) < minAreaDeg2) {
            stale.push({ areaId: area.id, polygonId, reason: "degenerate" });
          }
        }
      }
    }
  }
  return stale;
}

/**
 * {@link findStaleBindings} の結果のうち、**共有ストアへ伝播させてよい自動解除**
 * だけを返す。missing（エディタに不在）は P2P 同期の未着と区別できないため
 * 除外し、degenerate（実データで面積ほぼ 0 と確認できる破綻）のみを残す。
 * この一点が 2026-07-19 の紐付け全消失インシデントの是正の核心のため、純関数に
 * 切り出して回帰テストで固定する（docs/wants/03「区域紐付けの無効ポリゴン ID 修復」）。
 */
export function selectPropagatingUnbinds(
  stale: readonly StaleBinding[],
): StaleBinding[] {
  return stale.filter((s) => s.reason === "degenerate");
}
