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
    const second = SQUARE.map((v) => ({
      lat: v.lat + 0.01,
      lng: v.lng + 0.01,
    }));
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

  it("末尾が先頭と一致する閉じたリングでも例外を出さず作成する", async () => {
    const ed = await newEditor();
    // AI は最初の点を末尾に再掲して閉じることがある。snapToVertex での二重エッジを防ぐ。
    const closed: LatLng[] = [...SQUARE, { ...SQUARE[0] }];
    const ids = commitDraftPolygons(ed, [{ vertices: closed }]);
    expect(ids).toHaveLength(1);
    expect(ed.getPolygons()).toHaveLength(1);
    expect(ed.getVertices()).toHaveLength(4); // 重複した末尾は除去される
  });

  it("連続する重複頂点は除去して作成する", async () => {
    const ed = await newEditor();
    const dup: LatLng[] = [
      SQUARE[0],
      { ...SQUARE[0] }, // 重複
      SQUARE[1],
      SQUARE[2],
      { ...SQUARE[2] }, // 重複
      SQUARE[3],
    ];
    const ids = commitDraftPolygons(ed, [{ vertices: dup }]);
    expect(ids).toHaveLength(1);
    expect(ed.getVertices()).toHaveLength(4);
  });

  it("自己接触（非連続の重複頂点）は単純リングに正規化して作成し孤立頂点を残さない", async () => {
    const ed = await newEditor();
    // 非連続で先頭点が再出現 → 従来は閉じる際に二重エッジで内部エラー＋孤立頂点。
    const selfTouch: LatLng[] = [
      SQUARE[0],
      SQUARE[1],
      { ...SQUARE[0] }, // 非連続の重複
      SQUARE[2],
    ];
    const ids = commitDraftPolygons(ed, [{ vertices: selfTouch }]);
    expect(ids).toHaveLength(1);
    expect(ed.getPolygons()).toHaveLength(1);
    // 重複頂点は除去され三角形(3頂点)。孤立頂点は無い。
    expect(ed.getVertices()).toHaveLength(3);
  });

  it("重複を含むポリゴンと正常ポリゴンを両方作成し孤立頂点を残さない", async () => {
    const ed = await newEditor();
    const selfTouch: LatLng[] = [
      SQUARE[0],
      SQUARE[1],
      { ...SQUARE[0] },
      SQUARE[2],
    ];
    const good = SQUARE.map((v) => ({ lat: v.lat + 0.02, lng: v.lng + 0.02 }));
    const ids = commitDraftPolygons(ed, [
      { vertices: selfTouch },
      { vertices: good },
    ]);
    expect(ids).toHaveLength(2);
    expect(ed.getPolygons()).toHaveLength(2);
    // 三角形(3) + 四角形(4) = 7 頂点、孤立なし
    expect(ed.getVertices()).toHaveLength(7);
  });

  it("既存の内側に含まれる新ポリゴンは差集合で消え、追加されない", async () => {
    const ed = await newEditor();
    // 既存として大きめの四角形を作る。
    const big: LatLng[] = [
      { lat: 35.767, lng: 140.318 },
      { lat: 35.77, lng: 140.318 },
      { lat: 35.77, lng: 140.322 },
      { lat: 35.767, lng: 140.322 },
    ];
    commitDraftPolygons(ed, [{ vertices: big }]);
    expect(ed.getPolygons()).toHaveLength(1);

    // 既存の内側に完全に含まれる新ポリゴン → クリップで消える。
    const inside: LatLng[] = [
      { lat: 35.768, lng: 140.319 },
      { lat: 35.769, lng: 140.319 },
      { lat: 35.769, lng: 140.321 },
      { lat: 35.768, lng: 140.321 },
    ];
    const ids = commitDraftPolygons(ed, [{ vertices: inside }]);
    expect(ids).toHaveLength(0);
    expect(ed.getPolygons()).toHaveLength(1); // 既存のまま
  });

  it("除去後に3点未満になるポリゴンはスキップする", async () => {
    const ed = await newEditor();
    // 実質2点（重複だらけ）→ スキップ、後続の正常ポリゴンは作成
    const degenerate: LatLng[] = [
      SQUARE[0],
      { ...SQUARE[0] },
      SQUARE[1],
      { ...SQUARE[1] },
    ];
    const ids = commitDraftPolygons(ed, [
      { vertices: degenerate },
      { vertices: SQUARE },
    ]);
    expect(ids).toHaveLength(1);
    expect(ed.getPolygons()).toHaveLength(1);
  });
});
