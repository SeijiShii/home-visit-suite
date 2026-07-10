// PolygonService.deletePolygonEdges: ポリゴン削除時に孤立頂点を残さない。

import { describe, expect, it } from "vitest";
import {
  NetworkPolygonEditor,
  type StorageAdapter,
  type VertexID,
} from "map-polygon-editor";
import { PolygonService, type PolygonBindingAPI } from "./polygon-service";

function memAdapter(): StorageAdapter {
  return { loadAll: async () => ({ vertices: [], edges: [], polygons: [] }) };
}

const stubRegionAPI: PolygonBindingAPI = {
  BindPolygonToArea: async () => {},
  UnbindPolygonFromArea: async () => {},
};

async function drawSquare(
  ed: NetworkPolygonEditor,
  pts: Array<[number, number]>,
) {
  ed.startDrawing();
  let first: VertexID | null = null;
  for (const [lat, lng] of pts) {
    const cs = ed.placeVertex(lat, lng);
    if (first === null && cs.vertices.added[0]) first = cs.vertices.added[0].id;
  }
  ed.snapToVertex(first!);
  ed.endDrawing();
}

describe("PolygonService.deletePolygonEdges の孤立頂点掃除", () => {
  it("ポリゴンを削除すると、その頂点も残らない", async () => {
    const ed = new NetworkPolygonEditor(memAdapter());
    await ed.init();
    await drawSquare(ed, [
      [35.767, 140.318],
      [35.769, 140.318],
      [35.769, 140.321],
      [35.767, 140.321],
    ]);
    expect(ed.getPolygons()).toHaveLength(1);
    expect(ed.getVertices()).toHaveLength(4);

    const svc = new PolygonService(ed, stubRegionAPI);
    svc.deletePolygonEdges(ed.getPolygons()[0]);

    expect(ed.getPolygons()).toHaveLength(0);
    expect(ed.getVertices()).toHaveLength(0); // 孤立頂点なし
    expect(ed.getEdges()).toHaveLength(0);
  });
});
