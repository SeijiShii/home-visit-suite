// assignPlacesToPolygons: AI 下書きの場所を、それを内包する取込ポリゴンに割り当てる。
// docs/wants/03_地図機能.md Phase 1.1（場所番号→Place 生成は紐付け後）。

import { describe, expect, it } from "vitest";
import type { DraftPlace } from "../services/ai-map-import";
import { assignPlacesToPolygons, type PolygonRing } from "./assign-places-to-polygons";

// ring は [lng, lat] の配列（GeoJSON coordinates[0] 相当）。
const SQUARE: PolygonRing = {
  id: "poly-A",
  ring: [
    [140.318, 35.767],
    [140.321, 35.767],
    [140.321, 35.769],
    [140.318, 35.769],
  ],
};
const OTHER: PolygonRing = {
  id: "poly-B",
  ring: [
    [140.33, 35.78],
    [140.332, 35.78],
    [140.332, 35.782],
    [140.33, 35.782],
  ],
};

function place(lat: number, lng: number, number: number): DraftPlace {
  return { geo: { lat, lng }, number, label: "", address: "" };
}

describe("assignPlacesToPolygons", () => {
  it("内包するポリゴンに場所を割り当てる", () => {
    const res = assignPlacesToPolygons(
      [SQUARE, OTHER],
      [place(35.768, 140.3195, 1), place(35.781, 140.331, 2)],
    );
    expect(res).toEqual([
      { polygonId: "poly-A", place: place(35.768, 140.3195, 1) },
      { polygonId: "poly-B", place: place(35.781, 140.331, 2) },
    ]);
  });

  it("どのポリゴンにも含まれない場所はスキップする", () => {
    const res = assignPlacesToPolygons(
      [SQUARE],
      [place(35.768, 140.3195, 1), place(0, 0, 2)],
    );
    expect(res).toHaveLength(1);
    expect(res[0].place.number).toBe(1);
  });

  it("最初に内包したポリゴンに割り当てる（重複割当なし）", () => {
    const res = assignPlacesToPolygons([SQUARE, SQUARE], [place(35.768, 140.3195, 1)]);
    expect(res).toHaveLength(1);
    expect(res[0].polygonId).toBe("poly-A");
  });

  it("空入力は空を返す", () => {
    expect(assignPlacesToPolygons([], [place(35.768, 140.3195, 1)])).toEqual([]);
    expect(assignPlacesToPolygons([SQUARE], [])).toEqual([]);
  });
});
