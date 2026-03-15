import type {
  MapPolygonEditor,
  DraftShape,
  MapPolygon,
  PolygonID,
  BridgeResult,
} from "map-polygon-editor";
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
}

export class PolygonService {
  constructor(
    private readonly editor: MapPolygonEditor,
    private readonly regionAPI: PolygonBindingAPI,
  ) {}

  async savePolygonForArea(
    draft: DraftShape,
    areaId: string,
    displayName: string,
  ): Promise<MapPolygon> {
    if (!draft.isClosed) {
      throw new Error("Cannot save: draft is not closed.");
    }
    const polygon = await this.editor.saveAsPolygon(draft, displayName);
    await this.regionAPI.BindPolygonToArea(areaId, polygon.id as string);
    return polygon;
  }

  async deletePolygonForArea(
    polygonId: PolygonID,
    areaId: string,
  ): Promise<void> {
    await this.editor.deletePolygon(polygonId);
    await this.regionAPI.UnbindPolygonFromArea(areaId);
  }

  async savePolygon(
    draft: DraftShape,
    displayName: string,
  ): Promise<MapPolygon> {
    if (!draft.isClosed) {
      throw new Error("Cannot save: draft is not closed.");
    }
    return this.editor.saveAsPolygon(draft, displayName);
  }

  async bridgePolygon(
    polygonAId: PolygonID,
    aVertexIndex: number,
    polygonBId: PolygonID,
    bVertexIndex: number,
    bridgePath: { lat: number; lng: number }[],
    name: string,
  ): Promise<BridgeResult> {
    return this.editor.bridgePolygons(
      polygonAId,
      aVertexIndex,
      polygonBId,
      bVertexIndex,
      bridgePath,
      name,
    );
  }

  getAllPolygons(): MapPolygon[] {
    return this.editor.getAllPolygons();
  }
}
