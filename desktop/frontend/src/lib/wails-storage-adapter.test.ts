import { describe, it, expect, vi, beforeEach } from "vitest";
import { WailsStorageAdapter } from "./wails-storage-adapter";
import type { Vertex, Edge, PolygonSnapshot } from "map-polygon-editor";
import {
  createVertexID,
  createEdgeID,
  createPolygonID,
} from "map-polygon-editor";

// Wails Go バインディングのモック
const mockMapBinding = {
  GetNetworkJSON: vi.fn(),
  SaveNetworkJSON: vi.fn(),
};

describe("WailsStorageAdapter", () => {
  let adapter: WailsStorageAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WailsStorageAdapter(mockMapBinding);
  });

  describe("loadAll", () => {
    it("空のデータを返す", async () => {
      mockMapBinding.GetNetworkJSON.mockResolvedValue(
        JSON.stringify({ vertices: [], edges: [], polygons: [] }),
      );

      const result = await adapter.loadAll();

      expect(result.vertices).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.polygons).toEqual([]);
    });

    it("頂点・線分・ポリゴンをパースして返す", async () => {
      const v1 = createVertexID("v1");
      const v2 = createVertexID("v2");
      const v3 = createVertexID("v3");
      const e1 = createEdgeID("e1");
      const e2 = createEdgeID("e2");
      const e3 = createEdgeID("e3");
      const p1 = createPolygonID("p1");

      const data = {
        vertices: [
          { id: v1, lat: 35.776, lng: 140.318 },
          { id: v2, lat: 35.777, lng: 140.319 },
          { id: v3, lat: 35.778, lng: 140.32 },
        ],
        edges: [
          { id: e1, v1, v2 },
          { id: e2, v1: v2, v2: v3 },
          { id: e3, v1: v3, v2: v1 },
        ],
        polygons: [
          { id: p1, edgeIds: [e1, e2, e3], vertexIds: [v1, v2, v3], holes: [] },
        ],
      };

      mockMapBinding.GetNetworkJSON.mockResolvedValue(JSON.stringify(data));

      const result = await adapter.loadAll();

      expect(result.vertices).toHaveLength(3);
      expect(result.vertices[0].lat).toBe(35.776);
      expect(result.edges).toHaveLength(3);
      expect(result.polygons).toHaveLength(1);
      expect(result.polygons[0].edgeIds).toEqual([e1, e2, e3]);
    });

    it("Go側のエラーを伝播する", async () => {
      mockMapBinding.GetNetworkJSON.mockRejectedValue(
        new Error("storage error"),
      );

      await expect(adapter.loadAll()).rejects.toThrow("storage error");
    });
  });

  describe("saveAll", () => {
    it("ネットワークデータをJSON化してGo側に送る", async () => {
      mockMapBinding.SaveNetworkJSON.mockResolvedValue(undefined);

      const v1 = createVertexID("v1");
      const v2 = createVertexID("v2");
      const e1 = createEdgeID("e1");
      const p1 = createPolygonID("p1");

      const data = {
        vertices: [
          { id: v1, lat: 35.776, lng: 140.318 },
          { id: v2, lat: 35.777, lng: 140.319 },
        ] as Vertex[],
        edges: [{ id: e1, v1, v2 }] as Edge[],
        polygons: [
          { id: p1, edgeIds: [e1], vertexIds: [v1, v2], holes: [] },
        ] as PolygonSnapshot[],
      };

      await adapter.saveAll(data);

      expect(mockMapBinding.SaveNetworkJSON).toHaveBeenCalledWith(
        JSON.stringify(data),
      );
    });

    it("Go側のエラーを伝播する", async () => {
      mockMapBinding.SaveNetworkJSON.mockRejectedValue(
        new Error("write error"),
      );

      await expect(
        adapter.saveAll({ vertices: [], edges: [], polygons: [] }),
      ).rejects.toThrow("write error");
    });
  });
});
