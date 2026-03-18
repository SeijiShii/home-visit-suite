import {
  type MapPolygonEditor,
  type DraftShape,
  type MapPolygon,
  type PolygonID,
  type Point,
  type BridgeResult,
  type GeometryViolation,
  insertPoint,
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

  async deletePolygon(polygonId: PolygonID): Promise<void> {
    await this.editor.deletePolygon(polygonId);
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

  async splitPolygon(
    polygonId: PolygonID,
    draft: DraftShape,
  ): Promise<MapPolygon[]> {
    return this.editor.splitPolygon(polygonId, draft);
  }

  async moveVertex(
    polygonId: PolygonID,
    index: number,
    lat: number,
    lng: number,
  ): Promise<MapPolygon[]> {
    return this.editor.sharedEdgeMove(polygonId, index, lat, lng);
  }

  async insertVertex(
    polygonId: PolygonID,
    afterIndex: number,
    lat: number,
    lng: number,
  ): Promise<MapPolygon> {
    const draft = this.editor.loadPolygonToDraft(polygonId);
    const updated = insertPoint(draft, afterIndex + 1, { lat, lng });
    return this.editor.updatePolygonGeometry(polygonId, updated);
  }

  findNearestVertex(point: Point, radius: number): Point | null {
    return this.editor.findNearestVertex(point, radius);
  }

  findEdgeIntersections(p1: Point, p2: Point): Point[] {
    return this.editor.findEdgeIntersections(p1, p2);
  }

  async carveInnerPolygon(
    polygonId: PolygonID,
    loopPath: { lat: number; lng: number }[],
  ): Promise<{ outer: MapPolygon; inner: MapPolygon }> {
    return this.editor.carveInnerPolygon(polygonId, loopPath);
  }

  async expandWithPolygon(
    polygonId: PolygonID,
    outerPath: { lat: number; lng: number }[],
    childName: string,
  ): Promise<{ original: MapPolygon; added: MapPolygon }> {
    return this.editor.expandWithPolygon(polygonId, outerPath, childName);
  }

  async renamePolygon(polygonId: PolygonID, name: string): Promise<MapPolygon> {
    return this.editor.renamePolygon(polygonId, name);
  }

  validateDraft(draft: DraftShape): GeometryViolation[] {
    return this.editor.validateDraft(draft);
  }

  async undo(): Promise<void> {
    return this.editor.undo();
  }

  async redo(): Promise<void> {
    return this.editor.redo();
  }

  canUndo(): boolean {
    return this.editor.canUndo();
  }

  canRedo(): boolean {
    return this.editor.canRedo();
  }

  async resolveOverlapsWithDraft(polygonId: PolygonID, draft: DraftShape) {
    return this.editor.resolveOverlapsWithDraft(polygonId, draft);
  }

  async resolveOverlaps(polygonIds: PolygonID[]) {
    return this.editor.resolveOverlaps(polygonIds);
  }

  async savePolygonResolvingOverlaps(
    draft: DraftShape,
    displayName: string,
  ): Promise<
    | { saved: MapPolygon }
    | {
        modified: MapPolygon;
        created: MapPolygon[];
        remainingDrafts: DraftShape[];
      }
  > {
    if (!draft.isClosed) {
      throw new Error("Cannot save: draft is not closed.");
    }

    // ドラフトの各辺が既存ポリゴンと交差するか確認
    let hasIntersection = false;
    for (let i = 0; i < draft.points.length; i++) {
      const p1 = draft.points[i];
      const p2 = draft.points[(i + 1) % draft.points.length];
      if (this.editor.findEdgeIntersections(p1, p2).length > 0) {
        hasIntersection = true;
        break;
      }
    }

    if (hasIntersection) {
      const openDraft: DraftShape = { points: draft.points, isClosed: false };
      for (const poly of this.editor.getAllPolygons()) {
        const result = await this.editor.resolveOverlapsWithDraft(
          poly.id,
          openDraft,
        );
        if (result.created.length > 0) {
          return {
            modified: result.modified,
            created: result.created,
            remainingDrafts: result.remainingDrafts,
          };
        }
      }
    }

    // 交差なし → 通常保存
    const saved = await this.editor.saveAsPolygon(draft, displayName);
    return { saved };
  }

  getAllPolygons(): MapPolygon[] {
    return this.editor.getAllPolygons();
  }
}
