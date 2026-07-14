import { describe, expect, it } from "vitest";
import {
  areaParentKey,
  computeParentBoundaryEdges,
} from "./parent-boundary";

describe("areaParentKey", () => {
  it("区域ID から親番キー（領域-区域親番）を取り出す", () => {
    expect(areaParentKey("NRT-001-05")).toBe("NRT-001");
    expect(areaParentKey("NRT-002-01")).toBe("NRT-002");
  });

  it("区切りが無い ID はそのまま返す", () => {
    expect(areaParentKey("XYZ")).toBe("XYZ");
  });
});

describe("computeParentBoundaryEdges", () => {
  const areaIds = new Map([
    ["p1", "NRT-001-01"],
    ["p2", "NRT-001-02"],
    ["p3", "NRT-002-01"],
  ]);

  it("異なる親番のポリゴンが共有する辺は境目になる", () => {
    const result = computeParentBoundaryEdges(
      [
        { id: "p1", edgeIds: ["e1", "e2"] },
        { id: "p3", edgeIds: ["e2", "e3"] },
      ],
      areaIds,
    );
    expect(result.has("e2")).toBe(true);
  });

  it("同一親番のポリゴンが共有する辺は境目にならない", () => {
    const result = computeParentBoundaryEdges(
      [
        { id: "p1", edgeIds: ["e1", "e2"] },
        { id: "p2", edgeIds: ["e2", "e3"] },
      ],
      areaIds,
    );
    expect(result.has("e2")).toBe(false);
  });

  it("紐付け済みポリゴンが片側にしかない辺（外周）は境目になる", () => {
    const result = computeParentBoundaryEdges(
      [
        { id: "p1", edgeIds: ["e1", "e2"] },
        { id: "p2", edgeIds: ["e2", "e3"] },
      ],
      areaIds,
    );
    expect(result.has("e1")).toBe(true);
    expect(result.has("e3")).toBe(true);
  });

  it("未紐付けポリゴンだけが使う辺は境目にならない", () => {
    const result = computeParentBoundaryEdges(
      [
        { id: "p1", edgeIds: ["e1", "e2"] },
        { id: "unbound", edgeIds: ["e2", "e9"] },
      ],
      areaIds,
    );
    expect(result.has("e9")).toBe(false);
    // 紐付け済み側から見れば e2 は片側のみ → 外周として境目
    expect(result.has("e2")).toBe(true);
  });

  it("紐付け済みポリゴンが無ければ空を返す", () => {
    const result = computeParentBoundaryEdges(
      [{ id: "unbound", edgeIds: ["e1"] }],
      areaIds,
    );
    expect(result.size).toBe(0);
  });
});
