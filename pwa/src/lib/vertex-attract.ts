// ドラッグ中の頂点吸着（磁着）の純ロジック。
// 仕様: docs/wants/03「頂点ドラッグでの頂点統合（マージ）/ ドラッグ中の吸着」。
// カーソル位置が他の頂点（同一ポリゴン内・隣接含む）の吸着しきい値内に
// 入ったら、その頂点の位置を返す（プレビューを吸着させる）。しきい値外は
// null（吸着しない＝繊細な配置を許容）。

export interface AttractVertex {
  id: string;
  lat: number;
  lng: number;
}

/**
 * ドラッグ中のカーソル位置 (lat,lng) に対し、吸着すべき頂点を返す。
 * draggedId 自身は除外。radiusDeg 内で最も近い頂点を選ぶ。無ければ null。
 */
export function findAttractTarget(
  vertices: readonly AttractVertex[],
  draggedId: string,
  lat: number,
  lng: number,
  radiusDeg: number,
): AttractVertex | null {
  if (radiusDeg <= 0) return null;
  let best: AttractVertex | null = null;
  let bestD = radiusDeg;
  for (const v of vertices) {
    if (v.id === draggedId) continue;
    const d = Math.hypot(v.lat - lat, v.lng - lng);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
