// PolygonService.deletePolygonEdges: ポリゴン削除時に孤立頂点を残さない。

import { describe, expect, it } from "vitest";
import {
  NetworkPolygonEditor,
  type StorageAdapter,
  type VertexID,
} from "map-polygon-editor";
import {
  PolygonService,
  buildPolygonAreaMap,
  type PolygonBindingAPI,
} from "./polygon-service";
import type { AreaTreeNode } from "./region-service";

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

describe("PolygonService.deletePolygonEdges の共有辺保護", () => {
  it("辺を共有する隣接ポリゴンは削除後も形を保つ", async () => {
    const ed = new NetworkPolygonEditor(memAdapter());
    await ed.init();
    // ポリゴン A: 四角形
    await drawSquare(ed, [
      [35.767, 140.318],
      [35.769, 140.318],
      [35.769, 140.321],
      [35.767, 140.321],
    ]);
    const polyA = ed.getPolygons()[0];
    // A の右辺 (35.769,140.321)-(35.767,140.321) を共有する隣接ポリゴン B を描画:
    // 既存頂点にスナップして開始し、右側へ 2 頂点置き、もう一方の既存頂点で閉じる。
    const vTop = ed
      .getVertices()
      .find((v) => v.lat === 35.769 && v.lng === 140.321)!;
    const vBottom = ed
      .getVertices()
      .find((v) => v.lat === 35.767 && v.lng === 140.321)!;
    ed.startDrawing();
    ed.snapToVertex(vTop.id);
    ed.placeVertex(35.769, 140.324);
    ed.placeVertex(35.767, 140.324);
    ed.snapToVertex(vBottom.id);
    expect(ed.getPolygons()).toHaveLength(2);
    const polyB = ed.getPolygons().find((p) => p.id !== polyA.id)!;

    const svc = new PolygonService(ed, stubRegionAPI);
    svc.deletePolygonEdges(polyA);

    // B は共有辺ごと形を保って生存し、A の専有辺・頂点だけが消える
    const remaining = ed.getPolygons();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(polyB.id);
    expect(remaining[0].edgeIds).toHaveLength(4);
    expect(ed.getVertices()).toHaveLength(4); // B の頂点のみ（共有 2 + 専有 2）
    expect(ed.getEdges()).toHaveLength(4); // 宙に浮いた線分を残さない
  });
});

describe("buildPolygonAreaMap のラベル生成", () => {
  const tree = (parentName: string): AreaTreeNode[] => [
    {
      id: "NRT",
      name: "成田市",
      symbol: "NRT",
      parentAreas: [
        {
          id: "NRT-001",
          number: "001",
          name: parentName,
          areas: [{ id: "NRT-001-05", number: "05", polygonId: "poly-1" }],
        },
      ],
    },
  ];

  it("区域親番に名前があれば ID と名前を併記する", () => {
    const info = buildPolygonAreaMap(tree("加良部1丁目")).get("poly-1");
    expect(info?.areaLabel).toBe("NRT-001-05 加良部1丁目");
  });

  it("区域親番名が空なら ID のみを表示する", () => {
    const info = buildPolygonAreaMap(tree("")).get("poly-1");
    expect(info?.areaLabel).toBe("NRT-001-05");
  });
});
