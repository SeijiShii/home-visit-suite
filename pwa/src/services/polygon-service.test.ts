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
  toPolygonAreaIds,
  toPolygonAreaLabels,
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

describe("PolygonService.deletePolygonForAreas（N:M の削除）", () => {
  async function setup(unbind: PolygonBindingAPI["UnbindPolygonFromArea"]) {
    const ed = new NetworkPolygonEditor(memAdapter());
    await ed.init();
    await drawSquare(ed, [
      [35.767, 140.318],
      [35.767, 140.32],
      [35.765, 140.32],
      [35.765, 140.318],
    ]);
    const svc = new PolygonService(ed, {
      BindPolygonToArea: async () => {},
      UnbindPolygonFromArea: unbind,
    });
    return { ed, svc, snapshot: ed.getPolygons()[0] };
  }

  it("紐付く全区域から解除する", async () => {
    const calls: string[] = [];
    const { ed, svc, snapshot } = await setup(async (areaId) => {
      calls.push(areaId);
    });
    await svc.deletePolygonForAreas(snapshot, ["NRT-001-05", "NRT-002-03"]);
    expect(calls).toEqual(["NRT-001-05", "NRT-002-03"]);
    expect(ed.getPolygons()).toHaveLength(0);
  });

  it("1 区域の解除が失敗しても残りの区域の解除は続行する", async () => {
    // 失敗で打ち切ると、ポリゴン行が消えた後に UI から外せない紐付けが残る
    const calls: string[] = [];
    const { svc, snapshot } = await setup(async (areaId) => {
      calls.push(areaId);
      if (areaId === "NRT-001-05") throw new Error("not_found");
    });
    await expect(
      svc.deletePolygonForAreas(snapshot, ["NRT-001-05", "NRT-002-03"]),
    ).resolves.toBeUndefined();
    expect(calls).toEqual(["NRT-001-05", "NRT-002-03"]);
  });
});

describe("buildPolygonAreaMap のラベル生成", () => {
  // 内部 ID は識別子と無関係な不透明値にする。ここを "NRT-001-05" のような
  // 識別子そのものにすると、内部 ID を画面に出すバグが検出できなくなる
  // （実際に 2026-07-20 まで見逃していた）。
  const tree = (parentName: string): AreaTreeNode[] => [
    {
      id: "rg-1",
      name: "成田市",
      symbol: "NRT",
      parentAreas: [
        {
          id: "pa-1",
          number: "001",
          name: parentName,
          areas: [{ id: "ar-1", number: "05", polygonIds: ["poly-1"] }],
        },
      ],
    },
  ];

  it("区域親番に名前があれば識別子と名前を併記する", () => {
    const infos = buildPolygonAreaMap(tree("加良部1丁目")).get("poly-1");
    expect(infos?.[0].areaLabel).toBe("NRT-001-05 加良部1丁目");
    expect(infos?.[0].areaIdentifier).toBe("NRT-001-05");
  });

  it("区域親番名が空なら識別子のみを表示する", () => {
    const infos = buildPolygonAreaMap(tree("")).get("poly-1");
    expect(infos?.[0].areaLabel).toBe("NRT-001-05");
  });

  it("表示用の値に内部 ID を混ぜない", () => {
    const infos = buildPolygonAreaMap(tree("加良部1丁目")).get("poly-1");
    expect(infos?.[0].areaId).toBe("ar-1");
    expect(infos?.[0].areaLabel).not.toContain("ar-1");
    expect(infos?.[0].areaIdentifier).not.toContain("ar-1");
  });

  it("toPolygonAreaIds は処理用にポリゴンID→内部区域ID配列を取り出す", () => {
    const ids = toPolygonAreaIds(buildPolygonAreaMap(tree("加良部1丁目")));
    expect(ids.get("poly-1")).toEqual(["ar-1"]);
    expect(ids.size).toBe(1);
  });

  it("toPolygonAreaLabels は地図表示用に識別子配列を取り出す", () => {
    const labels = toPolygonAreaLabels(buildPolygonAreaMap(tree("加良部1丁目")));
    expect(labels.get("poly-1")).toEqual(["NRT-001-05"]);
  });

  it("複数の飛地ポリゴンはすべて同一区域へマップされる", () => {
    const multi: AreaTreeNode[] = [
      {
        id: "rg-1",
        name: "成田市",
        symbol: "NRT",
        parentAreas: [
          {
            id: "pa-1",
            number: "001",
            name: "加良部1丁目",
            areas: [
              {
                id: "ar-1",
                number: "05",
                polygonIds: ["poly-1", "poly-2"],
              },
            ],
          },
        ],
      },
    ];
    const map = buildPolygonAreaMap(multi);
    expect(map.get("poly-1")?.[0].areaId).toBe("ar-1");
    expect(map.get("poly-2")?.[0].areaId).toBe("ar-1");
    expect(map.get("poly-1")?.[0].areaLabel).toBe("NRT-001-05 加良部1丁目");
    const ids = toPolygonAreaIds(map);
    expect(ids.get("poly-2")).toEqual(["ar-1"]);
    expect(ids.size).toBe(2);
  });

  // wants 03「1 つのポリゴンへの複数区域紐付け」: 大きな建物を複数区域で分担する
  it("同一ポリゴンを参照する複数区域はツリー順に並べて保持する", () => {
    const shared: AreaTreeNode[] = [
      {
        id: "rg-1",
        name: "成田市",
        symbol: "NRT",
        parentAreas: [
          {
            id: "pa-1",
            number: "001",
            name: "加良部1丁目",
            areas: [{ id: "ar-1", number: "05", polygonIds: ["poly-1"] }],
          },
          {
            id: "pa-2",
            number: "002",
            name: "加良部2丁目",
            areas: [{ id: "ar-2", number: "03", polygonIds: ["poly-1"] }],
          },
        ],
      },
    ];
    const map = buildPolygonAreaMap(shared);
    expect(map.get("poly-1")?.map((i) => i.areaId)).toEqual(["ar-1", "ar-2"]);
    expect(map.get("poly-1")?.[1].areaLabel).toBe("NRT-002-03 加良部2丁目");
    expect(toPolygonAreaLabels(map).get("poly-1")).toEqual([
      "NRT-001-05",
      "NRT-002-03",
    ]);
  });
});
