import { describe, it, expect } from "vitest";
import type { Polygon } from "geojson";
import {
  findStaleBindings,
  selectPropagatingUnbinds,
} from "./area-binding-heal";
import type { AreaTreeNode } from "../services/region-service";

function makeTree(
  areas: { id: string; polygonIds?: string[] }[],
): AreaTreeNode[] {
  return [
    {
      id: "NRT",
      name: "",
      symbol: "NRT",
      parentAreas: [
        {
          id: "NRT-001",
          number: "001",
          name: "",
          areas: areas.map((a) => ({ number: "01", ...a })),
        },
      ],
    },
  ] as AreaTreeNode[];
}

// 1辺 0.01 度の正方形（十分な面積）
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ],
};

// ほぼ面積 0 のスリバー
const sliver: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.01, 0],
      [0.01, 1e-9],
      [0, 0],
    ],
  ],
};

describe("findStaleBindings", () => {
  it("存在しないポリゴンIDの紐付きを無効と判定する", () => {
    const tree = makeTree([{ id: "NRT-001-01", polygonIds: ["gone"] }]);
    const stale = findStaleBindings(tree, () => null);
    expect(stale).toEqual([
      { areaId: "NRT-001-01", polygonId: "gone", reason: "missing" },
    ]);
  });

  it("面積がほぼ 0 のポリゴンの紐付きを無効と判定する", () => {
    const tree = makeTree([{ id: "NRT-001-01", polygonIds: ["thin"] }]);
    const stale = findStaleBindings(tree, () => sliver);
    expect(stale).toEqual([
      { areaId: "NRT-001-01", polygonId: "thin", reason: "degenerate" },
    ]);
  });

  it("有効なポリゴンの紐付きは維持する", () => {
    const tree = makeTree([{ id: "NRT-001-01", polygonIds: ["ok"] }]);
    const stale = findStaleBindings(tree, () => square);
    expect(stale).toEqual([]);
  });

  it("飛地の一部だけが無効な場合、その ID のみ報告する", () => {
    const tree = makeTree([
      { id: "NRT-001-01", polygonIds: ["ok", "gone"] },
      { id: "NRT-001-02" },
    ]);
    const stale = findStaleBindings(tree, (id) =>
      id === "ok" ? square : null,
    );
    expect(stale).toEqual([
      { areaId: "NRT-001-01", polygonId: "gone", reason: "missing" },
    ]);
  });
});

describe("selectPropagatingUnbinds", () => {
  // 2026-07-19 紐付け全消失インシデントの是正の核心を固定する:
  // missing（未着と区別不能）は伝播 unbind の対象にせず、degenerate のみ残す。
  it("missing は伝播 unbind の対象から除外する", () => {
    const stale = [
      { areaId: "A", polygonId: "gone", reason: "missing" as const },
    ];
    expect(selectPropagatingUnbinds(stale)).toEqual([]);
  });

  it("degenerate は残す", () => {
    const stale = [
      { areaId: "A", polygonId: "thin", reason: "degenerate" as const },
    ];
    expect(selectPropagatingUnbinds(stale)).toEqual(stale);
  });

  it("混在時は degenerate だけを返す", () => {
    const stale = [
      { areaId: "A", polygonId: "gone", reason: "missing" as const },
      { areaId: "A", polygonId: "thin", reason: "degenerate" as const },
    ];
    expect(selectPropagatingUnbinds(stale)).toEqual([
      { areaId: "A", polygonId: "thin", reason: "degenerate" },
    ]);
  });
});
