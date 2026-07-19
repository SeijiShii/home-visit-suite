import {
  emptyChangeSet,
  type NetworkPolygonEditor,
  type PolygonSnapshot,
  type PolygonID,
  type ChangeSet,
} from "map-polygon-editor";
import type { Polygon } from "geojson";
import type { AreaTreeNode } from "./region-service";

export interface PolygonAreaInfo {
  areaId: string;
  areaLabel: string;
}

/**
 * ポリゴンID → 紐付く区域の一覧を構築する。区域⇔ポリゴンは N:M
 * （1 区域に複数の飛地ポリゴン／1 ポリゴンに複数区域。wants 03
 * 「1 つのポリゴンへの複数区域紐付け」）。並びは区域ツリー順で安定させ、
 * 先頭を代表区域（塗り分け色・親番境界判定・ツリー展開先）として扱う。
 */
export function buildPolygonAreaMap(
  tree: AreaTreeNode[],
): Map<string, PolygonAreaInfo[]> {
  const map = new Map<string, PolygonAreaInfo[]>();
  for (const region of tree) {
    for (const pa of region.parentAreas) {
      for (const area of pa.areas) {
        // 区域親番に名前があれば「ID 名前」で併記する（空名は ID のみ）。
        const areaLabel = pa.name ? `${area.id} ${pa.name}` : area.id;
        for (const polygonId of area.polygonIds ?? []) {
          const infos = map.get(polygonId);
          const info = { areaId: area.id, areaLabel };
          if (infos) infos.push(info);
          else map.set(polygonId, [info]);
        }
      }
    }
  }
  return map;
}

/** buildPolygonAreaMap の結果から、地図の区域IDラベル用に ポリゴンID→区域ID配列 を取り出す。 */
export function toPolygonAreaIds(
  areaMap: ReadonlyMap<string, PolygonAreaInfo[]>,
): Map<string, string[]> {
  return new Map(
    [...areaMap].map(([pid, infos]) => [pid, infos.map((i) => i.areaId)]),
  );
}

export interface PolygonBindingAPI {
  BindPolygonToArea(areaId: string, polygonId: string): Promise<void>;
  /** polygonId 指定時は当該ポリゴンのみ、省略時は全ポリゴンを解除する。 */
  UnbindPolygonFromArea(areaId: string, polygonId?: string): Promise<void>;
}

export class PolygonService {
  constructor(
    private readonly editor: NetworkPolygonEditor,
    private readonly regionAPI: PolygonBindingAPI,
  ) {}

  async bindPolygonToArea(polygonId: PolygonID, areaId: string): Promise<void> {
    await this.regionAPI.BindPolygonToArea(areaId, polygonId as string);
  }

  /** polygonId 指定時は当該ポリゴンのみ解除（飛地個別解除）、省略時は一括解除。 */
  async unbindPolygonFromArea(
    areaId: string,
    polygonId?: PolygonID,
  ): Promise<void> {
    await this.regionAPI.UnbindPolygonFromArea(
      areaId,
      polygonId as string | undefined,
    );
  }

  /** ポリゴンの構成エッジを削除（穴含む）→ ポリゴン消滅。孤立頂点も掃除する。
   * 隣接ポリゴンと共有している辺は削除せず残す（消すと隣の面が破綻するため）。 */
  deletePolygonEdges(snapshot: PolygonSnapshot): ChangeSet {
    // 他ポリゴン（外周・穴）が使っている辺は共有辺 → 削除対象から除外
    const sharedEdges = new Set<string>();
    for (const p of this.editor.getPolygons()) {
      if (p.id === snapshot.id) continue;
      for (const eid of p.edgeIds) sharedEdges.add(eid as string);
      for (const hole of p.holes) {
        for (const eid of hole) sharedEdges.add(eid as string);
      }
    }
    let lastCs: ChangeSet | null = null;
    // 穴のエッジを先に削除
    for (const holeEdges of snapshot.holes) {
      for (const edgeId of holeEdges) {
        if (sharedEdges.has(edgeId as string)) continue;
        lastCs = this.editor.removeEdge(edgeId);
      }
    }
    // 外周エッジを削除
    for (const edgeId of snapshot.edgeIds) {
      if (sharedEdges.has(edgeId as string)) continue;
      lastCs = this.editor.removeEdge(edgeId);
    }
    // エッジ削除では頂点が残る（ネットワークモデル）。他のエッジで使われて
    // いない、このポリゴンの頂点だけを削除して孤立頂点を残さない。
    const used = new Set<string>();
    for (const e of this.editor.getEdges()) {
      used.add(e.v1 as string);
      used.add(e.v2 as string);
    }
    for (const vid of snapshot.vertexIds) {
      if (!used.has(vid as string)) {
        try {
          lastCs = this.editor.removeVertex(vid);
        } catch {
          // 既に連鎖削除済み等は無視
        }
      }
    }
    return lastCs ?? emptyChangeSet();
  }

  /** 紐付く全区域（N:M）から当該ポリゴンの紐付けだけ外してポリゴンを削除する。 */
  async deletePolygonForAreas(
    snapshot: PolygonSnapshot,
    areaIds: readonly string[],
  ): Promise<void> {
    this.deletePolygonEdges(snapshot);
    // 削除したポリゴンの紐付けだけ外す（同一区域の他の飛地は維持）。
    // 1 区域の解除失敗（他メンバーによる区域削除等で not_found）で残りを
    // 打ち切ると、ポリゴン行が消えた後に UI から外せない紐付けが残るため、
    // 個別に握りつぶして全区域を試す。
    for (const areaId of areaIds) {
      try {
        await this.regionAPI.UnbindPolygonFromArea(
          areaId,
          snapshot.id as string,
        );
      } catch (e) {
        console.error("unbind polygon failed:", areaId, snapshot.id, e);
      }
    }
  }

  async save(): Promise<void> {
    await this.editor.save();
  }

  undo(): ChangeSet | null {
    return this.editor.undo();
  }

  redo(): ChangeSet | null {
    return this.editor.redo();
  }

  canUndo(): boolean {
    return this.editor.canUndo();
  }

  canRedo(): boolean {
    return this.editor.canRedo();
  }

  getPolygons(): PolygonSnapshot[] {
    return this.editor.getPolygons();
  }

  getPolygonGeoJSON(id: PolygonID): Polygon | null {
    return this.editor.getPolygonGeoJSON(id);
  }
}
