// AI 取込の下書きポリゴンを NetworkPolygonEditor の描画 API へ流し込むヘルパ。
// docs/wants/03_地図機能.md §出力データへのマッピング（境界線→map_vertices/edges/polygons）。
//
// エディタの描画状態機械を手動クリックの代わりにプログラムから駆動する:
//   startDrawing() → placeVertex×N → snapToVertex(始点) で閉じる → endDrawing()
// 生成ポリゴンは既存フロー同様「区域へ未紐付け」で作られ、ポリゴン一覧から紐付ける。

import type { NetworkPolygonEditor, PolygonID } from "map-polygon-editor";
import type { DraftPolygon } from "../services/ai-map-import";

/**
 * 下書きポリゴン群をエディタに作成し、作成されたポリゴン ID を返す。
 * 頂点が 3 点未満のポリゴンはスキップする。呼び出し側で editor.save() すること。
 */
export function commitDraftPolygons(
  editor: NetworkPolygonEditor,
  polygons: readonly DraftPolygon[],
): PolygonID[] {
  const created: PolygonID[] = [];
  for (const poly of polygons) {
    const verts = poly.vertices;
    if (verts.length < 3) continue;

    editor.startDrawing();
    let firstVertexId: ReturnType<typeof editor.placeVertex>["vertices"]["added"][number]["id"] | null =
      null;
    for (const v of verts) {
      const cs = editor.placeVertex(v.lat, v.lng);
      if (firstVertexId === null && cs.vertices.added.length > 0) {
        firstVertexId = cs.vertices.added[0].id;
      }
    }
    if (firstVertexId === null) {
      // 何も置けなかった異常系: 描画を畳んで次へ
      editor.endDrawing();
      continue;
    }
    // 始点にスナップしてリングを閉じる → この ChangeSet にポリゴンが作られる
    const closeCs = editor.snapToVertex(firstVertexId);
    editor.endDrawing();
    const poly0 = closeCs.polygons.created[0];
    if (poly0) created.push(poly0.id);
  }
  return created;
}
