// 地図データの保守ユーティリティ（開発用。最終的には削除予定）。
// 過去の AI 取込失敗などで生じた「孤立頂点」（どのポリゴンにも属さない頂点）を
// 一括削除する。map エディタのストレージ（LocalStorageMapBinding）に対して直接
// エディタを起こして掃除し、保存する。

import { NetworkPolygonEditor } from "map-polygon-editor";
import { NetworkStorageAdapter, type MapBindingAPI } from "./map-storage";

/**
 * どのポリゴンにも属さない孤立頂点を削除し、削除数を返す。
 * removeVertex は連鎖するエッジも除去するため、孤立した折れ線も一緒に消える。
 */
export async function removeOrphanVertices(
  mapBinding: MapBindingAPI,
): Promise<number> {
  const editor = new NetworkPolygonEditor(new NetworkStorageAdapter(mapBinding));
  await editor.init();

  const inPolygon = new Set<string>();
  for (const p of editor.getPolygons()) {
    for (const vid of p.vertexIds) inPolygon.add(vid as string);
  }
  const orphans = editor
    .getVertices()
    .filter((v) => !inPolygon.has(v.id as string));

  for (const v of orphans) {
    try {
      editor.removeVertex(v.id);
    } catch {
      // 連鎖削除で既に消えている等は無視
    }
  }
  if (orphans.length > 0) await editor.save();
  return orphans.length;
}
