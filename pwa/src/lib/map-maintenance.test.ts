// removeOrphanVertices: どのポリゴンにも属さない孤立頂点を削除する（開発用保守）。

import { describe, expect, it } from "vitest";
import {
  NetworkPolygonEditor,
  type VertexID,
} from "map-polygon-editor";
import { NetworkStorageAdapter, type MapBindingAPI } from "./map-storage";
import { removeOrphanVertices } from "./map-maintenance";

const SQUARE = [
  { lat: 35.767, lng: 140.318 },
  { lat: 35.769, lng: 140.318 },
  { lat: 35.769, lng: 140.321 },
  { lat: 35.767, lng: 140.321 },
];

function fakeBinding(): {
  binding: MapBindingAPI;
  get: () => { vertices: { id: string }[]; polygons: unknown[] };
  set: (net: unknown) => void;
} {
  const store = {
    json: JSON.stringify({ vertices: [], edges: [], polygons: [] }),
  };
  return {
    binding: {
      GetNetworkJSON: async () => store.json,
      SaveNetworkJSON: async (j: string) => {
        store.json = j;
      },
    },
    get: () => JSON.parse(store.json),
    set: (net: unknown) => {
      store.json = JSON.stringify(net);
    },
  };
}

describe("removeOrphanVertices", () => {
  it("孤立頂点を削除し、ポリゴンの頂点は残す", async () => {
    const fb = fakeBinding();

    // 正常な四角形を 1 つ作って保存する。
    const ed = new NetworkPolygonEditor(new NetworkStorageAdapter(fb.binding));
    await ed.init();
    ed.startDrawing();
    let first: VertexID | null = null;
    for (const v of SQUARE) {
      const cs = ed.placeVertex(v.lat, v.lng);
      if (first === null && cs.vertices.added[0]) first = cs.vertices.added[0].id;
    }
    ed.snapToVertex(first!);
    ed.endDrawing();
    await ed.save();

    // 孤立頂点を注入する（どのポリゴンにも属さない）。
    const net = fb.get() as {
      vertices: { id: string; lat: number; lng: number }[];
      edges: unknown[];
      polygons: unknown[];
    };
    net.vertices.push({ id: "orphan-1", lat: 35.9, lng: 140.5 });
    fb.set(net);

    const removed = await removeOrphanVertices(fb.binding);
    expect(removed).toBe(1);

    const after = fb.get();
    expect(after.vertices).toHaveLength(4);
    expect(after.vertices.some((v) => v.id === "orphan-1")).toBe(false);
    expect(after.polygons).toHaveLength(1);
  });

  it("孤立頂点が無ければ 0 を返し変更しない", async () => {
    const fb = fakeBinding();
    const removed = await removeOrphanVertices(fb.binding);
    expect(removed).toBe(0);
  });
});
