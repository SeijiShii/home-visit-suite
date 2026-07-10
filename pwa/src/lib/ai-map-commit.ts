// AI 取込の下書きポリゴンを NetworkPolygonEditor の描画 API へ流し込むヘルパ。
// docs/wants/03_地図機能.md §出力データへのマッピング（境界線→map_vertices/edges/polygons）。
//
// エディタの描画状態機械を手動クリックの代わりにプログラムから駆動する:
//   startDrawing() → placeVertex×N → snapToVertex(始点) で閉じる → endDrawing()
// 生成ポリゴンは既存フロー同様「区域へ未紐付け」で作られ、ポリゴン一覧から紐付ける。
//
// AI が返す境界線は重複頂点・自己交差を含みうる。重複頂点はエディタ内部の
// resolveIntersections が重複エッジを追加しようとして例外を投げる（取込全体が
// クラッシュする）ため、事前に頂点を正規化し、それでも失敗するポリゴンは
// try/catch でスキップして残りの取込を継続する。
//
// また、隣接エリアの取込で新ポリゴンが既存と重なる/近接する場合は、既存を優先し
// 新ポリゴンを既存へスナップ＋差集合でクリップしてから取り込む（境界共有）。

import type {
  NetworkPolygonEditor,
  PolygonID,
  VertexID,
} from "map-polygon-editor";
import type { LatLng } from "./area-detail-geo";
import type { DraftPolygon } from "../services/ai-map-import";
import { alignAndClipPolygon, type ClipOptions } from "./polygon-clip";

// 同一点とみなす緯度経度の許容差（度）。~0.1mm 相当。AI の重複頂点除去用。
const DEDUP_EPS = 1e-9;

function nearlyEqual(a: LatLng, b: LatLng): boolean {
  return (
    Math.abs(a.lat - b.lat) < DEDUP_EPS && Math.abs(a.lng - b.lng) < DEDUP_EPS
  );
}

/**
 * リングを正規化する: **既出の頂点と一致する頂点をすべて除去**する。
 * 連続重複はもちろん、非連続の重複（AI が先頭点を末尾に再掲する／同一点を
 * 二度打つ等の「自己接触」）も落とす。同一頂点を二度通るリングは閉じる際に
 * エディタ内部で二重エッジになり例外を投げるため、単純リング（重複頂点なし）
 * に正規化して未然に防ぐ。閉じるのは snapToVertex(始点) が行うため、
 * 末尾＝先頭の重複もここで除去される。
 */
function cleanRing(vertices: readonly LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const v of vertices) {
    if (!out.some((u) => nearlyEqual(u, v))) out.push(v);
  }
  return out;
}

/** エディタ内の既存ポリゴンの外周リング（LatLng 配列）を取得する。 */
function existingOuterRings(editor: NetworkPolygonEditor): LatLng[][] {
  const rings: LatLng[][] = [];
  for (const p of editor.getPolygons()) {
    const gj = editor.getPolygonGeoJSON(p.id);
    const outer = gj?.coordinates?.[0] as [number, number][] | undefined;
    if (outer && outer.length >= 3) {
      rings.push(outer.map(([lng, lat]) => ({ lat, lng })));
    }
  }
  return rings;
}

/**
 * 単一リングをエディタへ描画してポリゴンを作る。失敗時は描画状態をリセットし
 * 途中で置いた頂点を削除して孤立頂点を残さない。作成できた ID（無ければ null）を返す。
 */
function drawRing(
  editor: NetworkPolygonEditor,
  verts: readonly LatLng[],
): PolygonID | null {
  const addedVertexIds: VertexID[] = [];
  try {
    editor.startDrawing();
    let firstVertexId: VertexID | null = null;
    for (const v of verts) {
      const cs = editor.placeVertex(v.lat, v.lng);
      for (const av of cs.vertices.added) addedVertexIds.push(av.id);
      if (firstVertexId === null && cs.vertices.added.length > 0) {
        firstVertexId = cs.vertices.added[0].id;
      }
    }
    if (firstVertexId === null) {
      editor.endDrawing();
      return null;
    }
    // 始点にスナップしてリングを閉じる → この ChangeSet にポリゴンが作られる
    const closeCs = editor.snapToVertex(firstVertexId);
    editor.endDrawing();
    return closeCs.polygons.created[0]?.id ?? null;
  } catch (e) {
    // 自己交差・重複エッジ等でエディタ内部が例外を投げた場合は、この
    // ポリゴンを諦めて描画状態をリセットし、残りの取込を継続する。
    console.warn("commitDraftPolygons: ポリゴン取込をスキップしました", e);
    try {
      editor.endDrawing();
    } catch {
      // 描画状態のリセットも失敗した場合は無視して次へ
    }
    // 途中まで置いた頂点を削除して孤立頂点（本体なしの頂点）を残さない。
    for (const id of addedVertexIds) {
      try {
        editor.removeVertex(id);
      } catch {
        // 既に連鎖削除済み等は無視
      }
    }
    return null;
  }
}

/**
 * 下書きポリゴン群をエディタに作成し、作成されたポリゴン ID を返す。
 * - 既存ポリゴンがある場合は、既存優先で新ポリゴンをスナップ＋差集合クリップし、
 *   重なりを除去して外側だけを取り込む（隣接の境界共有・細かい交差ポリゴン抑制）。
 *   同一取込内で先に作ったポリゴンも「既存」に含めるため、都度読み直す。
 * - 頂点が 3 点未満のポリゴンはスキップする。
 * - 1 つのポリゴンが不正な形状でエディタ内部エラーになっても次へ進む。
 * 呼び出し側で editor.save() すること。
 */
export function commitDraftPolygons(
  editor: NetworkPolygonEditor,
  polygons: readonly DraftPolygon[],
  clipOpts?: ClipOptions,
): PolygonID[] {
  const created: PolygonID[] = [];
  for (const poly of polygons) {
    const base = cleanRing(poly.vertices);
    if (base.length < 3) continue;

    // 既存に対してスナップ＋差集合クリップ（既存が無ければそのまま）。
    const existing = existingOuterRings(editor);
    const pieces = alignAndClipPolygon(base, existing, clipOpts);

    for (const piece of pieces) {
      const verts = cleanRing(piece);
      if (verts.length < 3) continue;
      const id = drawRing(editor, verts);
      if (id) created.push(id);
    }
  }
  return created;
}
