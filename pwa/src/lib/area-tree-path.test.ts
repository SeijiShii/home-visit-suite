import { describe, it, expect } from "vitest";
import { findAreaPathForPolygon } from "./area-tree-path";
import type { AreaTreeNode } from "../services/region-service";

const tree: AreaTreeNode[] = [
  {
    id: "region-1",
    name: "成田",
    symbol: "NRT",
    parentAreas: [
      {
        id: "pa-1",
        number: "001",
        name: "加良部",
        areas: [
          { id: "NRT-001-01", number: "01", polygonIds: ["poly-a"] },
          { id: "NRT-001-02", number: "02" },
        ],
      },
      {
        id: "pa-2",
        number: "002",
        name: "囲護台",
        areas: [
          // 飛地: 1区域に複数ポリゴン
          { id: "NRT-002-01", number: "01", polygonIds: ["poly-b", "poly-c"] },
        ],
      },
    ],
  },
  {
    id: "region-2",
    name: "佐倉",
    symbol: "SKR",
    parentAreas: [
      {
        id: "pa-3",
        number: "001",
        name: "王子台",
        areas: [{ id: "SKR-001-01", number: "01", polygonIds: ["poly-d"] }],
      },
    ],
  },
];

describe("findAreaPathForPolygon", () => {
  it("紐付け済みポリゴンの祖先パス（領域・区域親番・区域）を返す", () => {
    expect(findAreaPathForPolygon(tree, "poly-a")).toEqual({
      regionId: "region-1",
      parentAreaId: "pa-1",
      areaId: "NRT-001-01",
    });
  });

  it("飛地の2つ目以降のポリゴンIDでも同じ区域パスを返す", () => {
    expect(findAreaPathForPolygon(tree, "poly-c")).toEqual({
      regionId: "region-1",
      parentAreaId: "pa-2",
      areaId: "NRT-002-01",
    });
  });

  it("2番目以降の領域配下も探索する", () => {
    expect(findAreaPathForPolygon(tree, "poly-d")).toEqual({
      regionId: "region-2",
      parentAreaId: "pa-3",
      areaId: "SKR-001-01",
    });
  });

  it("未紐付けポリゴンIDでは null を返す", () => {
    expect(findAreaPathForPolygon(tree, "poly-unknown")).toBeNull();
  });

  it("空ツリーでは null を返す", () => {
    expect(findAreaPathForPolygon([], "poly-a")).toBeNull();
  });
});
