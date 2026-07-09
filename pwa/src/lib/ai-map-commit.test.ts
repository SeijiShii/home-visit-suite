// commitDraftPolygons: AI 取込の下書きポリゴンを NetworkPolygonEditor へ流し込む。
// エディタは DOM 非依存で駆動できるためインメモリ StorageAdapter でテストする。

import { describe, expect, it } from "vitest";
import { NetworkPolygonEditor, type StorageAdapter } from "map-polygon-editor";
import type { LatLng } from "./area-detail-geo";
import { commitDraftPolygons } from "./ai-map-commit";

function memAdapter(): StorageAdapter {
  return { loadAll: async () => ({ vertices: [], edges: [], polygons: [] }) };
}

async function newEditor(): Promise<NetworkPolygonEditor> {
  const ed = new NetworkPolygonEditor(memAdapter());
  await ed.init();
  return ed;
}

const SQUARE: LatLng[] = [
  { lat: 35.767, lng: 140.318 },
  { lat: 35.769, lng: 140.318 },
  { lat: 35.769, lng: 140.321 },
  { lat: 35.767, lng: 140.321 },
];

describe("commitDraftPolygons", () => {
  it("下書きポリゴンをエディタに作成し、作成 ID を返す", async () => {
    const ed = await newEditor();
    const ids = commitDraftPolygons(ed, [{ vertices: SQUARE }]);

    expect(ids).toHaveLength(1);
    expect(ed.getPolygons()).toHaveLength(1);
    expect(ed.getPolygons()[0].vertexIds).toHaveLength(4);
    expect(ed.getVertices()).toHaveLength(4);
  });

  it("複数ポリゴンを一括作成できる", async () => {
    const ed = await newEditor();
    const second = SQUARE.map((v) => ({ lat: v.lat + 0.01, lng: v.lng + 0.01 }));
    const ids = commitDraftPolygons(ed, [
      { vertices: SQUARE },
      { vertices: second },
    ]);
    expect(ids).toHaveLength(2);
    expect(ed.getPolygons()).toHaveLength(2);
  });

  it("頂点が3点未満のポリゴンはスキップする", async () => {
    const ed = await newEditor();
    const ids = commitDraftPolygons(ed, [
      { vertices: SQUARE.slice(0, 2) },
      { vertices: SQUARE },
    ]);
    expect(ids).toHaveLength(1);
    expect(ed.getPolygons()).toHaveLength(1);
  });

  it("空配列なら何も作らない", async () => {
    const ed = await newEditor();
    expect(commitDraftPolygons(ed, [])).toEqual([]);
    expect(ed.getPolygons()).toHaveLength(0);
  });
});
