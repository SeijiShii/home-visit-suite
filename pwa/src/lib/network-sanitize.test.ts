// ロード時ネットワーク整合性サニタイズの検証。
// 端末ローカル DB に不整合（辺が参照する頂点の欠落等）があると
// NetworkPolygonEditor.init() が throw して地図画面全体が描画不能になるため、
// 整合しない要素を非破壊（メモリ上のみ・書き戻さない）で除外する。
import { describe, expect, it } from "vitest";
import { sanitizeNetworkSnapshot } from "./network-sanitize";

type V = { id: string; lat: number; lng: number };
type E = { id: string; v1: string; v2: string };
type P = {
  id: string;
  edgeIds: string[];
  holes: string[][];
  vertexIds: string[];
};

const v = (id: string): V => ({ id, lat: 35, lng: 139 });
const e = (id: string, v1: string, v2: string): E => ({ id, v1, v2 });
const p = (id: string, edgeIds: string[], vertexIds: string[], holes: string[][] = []): P => ({
  id,
  edgeIds,
  holes,
  vertexIds,
});

describe("sanitizeNetworkSnapshot", () => {
  it("整合したデータはそのまま通す", () => {
    const data = {
      vertices: [v("a"), v("b"), v("c")],
      edges: [e("ab", "a", "b"), e("bc", "b", "c"), e("ca", "c", "a")],
      polygons: [p("P1", ["ab", "bc", "ca"], ["a", "b", "c"])],
    };
    const r = sanitizeNetworkSnapshot(data);
    expect(r.data).toEqual(data);
    expect(r.droppedEdgeIds).toEqual([]);
    expect(r.droppedPolygonIds).toEqual([]);
  });

  it("存在しない頂点を参照する辺と、その辺を使う面を除外する", () => {
    const data = {
      vertices: [v("a"), v("b"), v("c")],
      edges: [
        e("ab", "a", "b"),
        e("bc", "b", "c"),
        e("ca", "c", "a"),
        e("bad", "a", "MISSING"),
      ],
      polygons: [
        p("P1", ["ab", "bc", "ca"], ["a", "b", "c"]),
        p("P2", ["ab", "bad"], ["a", "b"]),
      ],
    };
    const r = sanitizeNetworkSnapshot(data);
    expect(r.data.edges.map((x) => x.id)).toEqual(["ab", "bc", "ca"]);
    expect(r.data.polygons.map((x) => x.id)).toEqual(["P1"]);
    expect(r.droppedEdgeIds).toEqual(["bad"]);
    expect(r.droppedPolygonIds).toEqual(["P2"]);
  });

  it("存在しない頂点/辺を直接参照する面を除外する", () => {
    const data = {
      vertices: [v("a"), v("b"), v("c")],
      edges: [e("ab", "a", "b"), e("bc", "b", "c"), e("ca", "c", "a")],
      polygons: [
        p("P1", ["ab", "bc", "ca"], ["a", "b", "MISSING_V"]),
        p("P2", ["ab", "MISSING_E"], ["a", "b"]),
        p("P3", ["ab", "bc", "ca"], ["a", "b", "c"]),
      ],
    };
    const r = sanitizeNetworkSnapshot(data);
    expect(r.data.polygons.map((x) => x.id)).toEqual(["P3"]);
    expect(r.droppedPolygonIds.sort()).toEqual(["P1", "P2"]);
  });

  it("穴（holes）が参照する辺の欠落も面の除外条件になる", () => {
    const data = {
      vertices: [v("a"), v("b"), v("c")],
      edges: [e("ab", "a", "b"), e("bc", "b", "c"), e("ca", "c", "a")],
      polygons: [
        p("P1", ["ab", "bc", "ca"], ["a", "b", "c"], [["MISSING_E"]]),
      ],
    };
    const r = sanitizeNetworkSnapshot(data);
    expect(r.data.polygons).toEqual([]);
    expect(r.droppedPolygonIds).toEqual(["P1"]);
  });

  it("頂点は除外対象にしない（孤立頂点は編集コアが許容する）", () => {
    const data = {
      vertices: [v("a"), v("b"), v("lonely")],
      edges: [e("ab", "a", "b")],
      polygons: [],
    };
    const r = sanitizeNetworkSnapshot(data);
    expect(r.data.vertices.map((x) => x.id)).toEqual(["a", "b", "lonely"]);
  });
});
