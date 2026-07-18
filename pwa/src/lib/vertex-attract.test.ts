import { describe, it, expect } from "vitest";
import { findAttractTarget } from "./vertex-attract";

const square = [
  { id: "A", lat: 0, lng: 0 },
  { id: "B", lat: 1, lng: 0 },
  { id: "C", lat: 1, lng: 1 },
  { id: "D", lat: 0, lng: 1 },
];

describe("findAttractTarget", () => {
  it("しきい値内の最も近い他頂点へ吸着する（同一ポリゴンの隣接頂点も対象）", () => {
    // A をドラッグして B の近く (0.95, 0.02) へ
    const t = findAttractTarget(square, "A", 0.95, 0.02, 0.1);
    expect(t?.id).toBe("B");
  });

  it("しきい値の外では吸着しない（繊細な配置を許容）", () => {
    const t = findAttractTarget(square, "A", 0.8, 0.02, 0.1);
    expect(t).toBeNull();
  });

  it("ドラッグ中の頂点自身へは吸着しない", () => {
    const t = findAttractTarget(square, "A", 0.01, 0.01, 0.1);
    expect(t).toBeNull();
  });

  it("複数候補があれば最も近い頂点を選ぶ", () => {
    const t = findAttractTarget(square, "A", 0.97, 0.96, 0.2);
    expect(t?.id).toBe("C");
  });

  it("しきい値 0 以下は常に null", () => {
    expect(findAttractTarget(square, "A", 1, 0, 0)).toBeNull();
  });
});
