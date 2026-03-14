import type {
  MapPolygonEditor,
  DraftShape,
  MapPolygon,
  PolygonID,
} from "map-polygon-editor";

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

  getAllPolygons(): MapPolygon[] {
    return this.editor.getAllPolygons();
  }
}
