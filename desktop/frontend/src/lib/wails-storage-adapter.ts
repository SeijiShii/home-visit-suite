import type {
  StorageAdapter,
  Vertex,
  Edge,
  PolygonSnapshot,
} from "map-polygon-editor";

// Wails Go バインディングの型定義
export interface MapBindingAPI {
  GetNetworkJSON(): Promise<string>;
  SaveNetworkJSON(json: string): Promise<void>;
}

export class WailsStorageAdapter implements StorageAdapter {
  constructor(private readonly binding: MapBindingAPI) {}

  async loadAll(): Promise<{
    vertices: Vertex[];
    edges: Edge[];
    polygons: PolygonSnapshot[];
  }> {
    const json = await this.binding.GetNetworkJSON();
    return JSON.parse(json) as {
      vertices: Vertex[];
      edges: Edge[];
      polygons: PolygonSnapshot[];
    };
  }

  async saveAll(data: {
    vertices: Vertex[];
    edges: Edge[];
    polygons: PolygonSnapshot[];
  }): Promise<void> {
    await this.binding.SaveNetworkJSON(JSON.stringify(data));
  }
}
