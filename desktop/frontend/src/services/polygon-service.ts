import type {
  NetworkPolygonEditor,
  PolygonSnapshot,
  PolygonID,
  ChangeSet,
} from "map-polygon-editor";
import type { Polygon } from "geojson";
import type { AreaTreeNode } from "./region-service";

export interface PolygonAreaInfo {
  areaId: string;
  areaLabel: string;
}

export function buildPolygonAreaMap(
  tree: AreaTreeNode[],
): Map<string, PolygonAreaInfo> {
  const map = new Map<string, PolygonAreaInfo>();
  for (const region of tree) {
    for (const pa of region.parentAreas) {
      for (const area of pa.areas) {
        if (area.polygonId) {
          map.set(area.polygonId, {
            areaId: area.id,
            areaLabel: area.id,
          });
        }
      }
    }
  }
  return map;
}

export interface PolygonBindingAPI {
  BindPolygonToArea(areaId: string, polygonId: string): Promise<void>;
  UnbindPolygonFromArea(areaId: string): Promise<void>;
  RemapPolygonIds(idMap: Record<string, string>): Promise<void>;
}

export class PolygonService {
  constructor(
    private readonly editor: NetworkPolygonEditor,
    private readonly regionAPI: PolygonBindingAPI,
  ) {}

  async bindPolygonToArea(polygonId: PolygonID, areaId: string): Promise<void> {
    await this.regionAPI.BindPolygonToArea(areaId, polygonId as string);
  }

  async unbindPolygonFromArea(areaId: string): Promise<void> {
    await this.regionAPI.UnbindPolygonFromArea(areaId);
  }

  /** ポリゴンの構成エッジを全削除（穴含む）→ ポリゴン消滅 */
  deletePolygonEdges(snapshot: PolygonSnapshot): ChangeSet {
    let lastCs: ChangeSet | null = null;
    // 穴のエッジを先に削除
    for (const holeEdges of snapshot.holes) {
      for (const edgeId of holeEdges) {
        lastCs = this.editor.removeEdge(edgeId);
      }
    }
    // 外周エッジを削除
    for (const edgeId of snapshot.edgeIds) {
      lastCs = this.editor.removeEdge(edgeId);
    }
    return lastCs!;
  }

  async deletePolygonForArea(
    snapshot: PolygonSnapshot,
    areaId: string,
  ): Promise<void> {
    this.deletePolygonEdges(snapshot);
    await this.regionAPI.UnbindPolygonFromArea(areaId);
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
