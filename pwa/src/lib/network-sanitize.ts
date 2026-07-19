// ロード時ネットワーク整合性サニタイズ（純ロジック）。
// 仕様: docs/wants/03「ロード時のネットワーク整合性サニタイズ」。
//
// P2P 同期の部分適用などで端末ローカル DB に不整合（辺が参照する頂点の欠落・
// 面が参照する辺/頂点の欠落）が生じると、NetworkPolygonEditor.init() が throw
// して地図画面全体が描画不能になる。整合しない辺・面をメモリ上でのみ除外し、
// 残りの整合部分で地図を表示できるようにする。
//
// 非破壊原則: 除外結果はストレージへ書き戻さない。欠落が「他端末では存在する
// 行の未着」である可能性があり、書き戻し（削除）は ScopeNetwork 同期で全端末へ
// 伝播して実データを壊すため。後続の同期で欠落行が届けば次回ロードで自然回復する。

export interface NetworkSanitizeReport {
  droppedEdgeIds: string[];
  droppedPolygonIds: string[];
}

/**
 * ネットワークスナップショットから、存在しない頂点を参照する辺と、
 * 存在しない頂点/辺（穴を含む）を参照する面を除外する。
 * 孤立頂点は編集コアが許容するため除外しない。
 */
export function sanitizeNetworkSnapshot<
  V extends { id: string },
  E extends { id: string; v1: string; v2: string },
  P extends {
    id: string;
    edgeIds: string[];
    holes: string[][];
    vertexIds: string[];
  },
>(data: {
  vertices: V[];
  edges: E[];
  polygons: P[];
}): { data: { vertices: V[]; edges: E[]; polygons: P[] } } & NetworkSanitizeReport {
  const vertexIds = new Set(data.vertices.map((v) => v.id));

  const droppedEdgeIds: string[] = [];
  const edges = data.edges.filter((e) => {
    const ok = vertexIds.has(e.v1) && vertexIds.has(e.v2);
    if (!ok) droppedEdgeIds.push(e.id);
    return ok;
  });
  const edgeIds = new Set(edges.map((e) => e.id));

  const droppedPolygonIds: string[] = [];
  const polygons = data.polygons.filter((p) => {
    const ok =
      p.vertexIds.every((v) => vertexIds.has(v)) &&
      p.edgeIds.every((e) => edgeIds.has(e)) &&
      p.holes.every((hole) => hole.every((e) => edgeIds.has(e)));
    if (!ok) droppedPolygonIds.push(p.id);
    return ok;
  });

  return {
    data: { vertices: data.vertices, edges, polygons },
    droppedEdgeIds,
    droppedPolygonIds,
  };
}
