// 訪問記録画面ビューモデルの飛地対応: 複数対象ポリゴン・外接範囲中心・隣接除外。
// 仕様: docs/wants/03_地図機能.md「場所の直接編集（訪問記録画面内）」2026-07-15 改訂

import { describe, expect, it } from "vitest";
import type { Polygon as GeoPolygon } from "geojson";
import {
  buildAreaDetailViewModel,
  polygonCentersFromEditor,
  type PolygonGeoSource,
} from "./area-detail-controller";

function square(
  lat: number,
  lng: number,
  size = 0.002,
): GeoPolygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  };
}

function editorOf(polys: Record<string, GeoPolygon>): PolygonGeoSource {
  return {
    getPolygons: () => Object.keys(polys).map((id) => ({ id })),
    getPolygonGeoJSON: (id: string) => polys[id] ?? null,
  };
}

describe("buildAreaDetailViewModel の飛地対応", () => {
  const editor = editorOf({
    "poly-a": square(35.76, 140.31),
    "poly-b": square(35.77, 140.33), // poly-a から少し離れた飛地
    "poly-n": square(35.765, 140.32), // 近隣（別区域）
    "poly-far": square(36.5, 141.5), // 遠方（隣接外）
  });
  const centers = polygonCentersFromEditor(editor);
  const polygonToArea = new Map([
    ["poly-a", "NRT-001-05"],
    ["poly-b", "NRT-001-05"],
    ["poly-n", "NRT-001-06"],
    ["poly-far", "NRT-999-01"],
  ]);

  const vm = buildAreaDetailViewModel({
    polygonCenters: centers,
    polygonToArea,
    targetAreaId: "NRT-001-05",
    places: [],
    radiusKm: 2.5,
    viewportPx: 800,
  });

  it("対象区域の全飛地ポリゴンを targetPolygonIds に含める", () => {
    expect(vm).not.toBeNull();
    expect([...vm!.targetPolygonIds].sort()).toEqual(["poly-a", "poly-b"]);
  });

  it("中心は全飛地の外接範囲（バウンディングボックス）の中心", () => {
    // poly-a: lat 35.760..35.762 / lng 140.310..140.312
    // poly-b: lat 35.770..35.772 / lng 140.330..140.332
    expect(vm!.targetCenter.lat).toBeCloseTo((35.76 + 35.772) / 2, 6);
    expect(vm!.targetCenter.lng).toBeCloseTo((140.31 + 140.332) / 2, 6);
  });

  it("隣接判定は外接範囲中心から半径 N km、対象飛地自身は隣接に含めない", () => {
    expect(vm!.neighborIds.has("poly-n")).toBe(true);
    expect(vm!.neighborIds.has("poly-far")).toBe(false);
    expect(vm!.neighborIds.has("poly-a")).toBe(false);
    expect(vm!.neighborIds.has("poly-b")).toBe(false);
  });

  it("対象区域にポリゴンが無ければ null", () => {
    const none = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea,
      targetAreaId: "XXX-000-00",
      places: [],
      radiusKm: 2.5,
      viewportPx: 800,
    });
    expect(none).toBeNull();
  });
});
