import { describe, it, expect } from "vitest";
import { buildAreaDetailViewModel } from "./area-detail-controller";
import type { PolygonCenter, PlaceLike } from "./area-detail-geo";

const centers: PolygonCenter[] = [
  { id: "poly-target", center: { lat: 35.776, lng: 140.318 } },
  // 約 3km 北東
  { id: "poly-near", center: { lat: 35.803, lng: 140.35 } },
  // 約 50km 北東 (範囲外)
  { id: "poly-far", center: { lat: 36.2, lng: 140.8 } },
];

const polyToArea = new Map<string, string>([
  ["poly-target", "a-target"],
  ["poly-near", "a-near"],
  ["poly-far", "a-far"],
]);

const places: PlaceLike[] = [
  { id: "p1", lat: 35.776, lng: 140.318, deletedAt: null },
  { id: "p2", lat: 35.777, lng: 140.319, deletedAt: "2026-01-01T00:00:00Z" },
  { id: "p3", lat: 35.778, lng: 140.32, deletedAt: null },
];

describe("buildAreaDetailViewModel", () => {
  it("対象 areaId に紐づく polygonId が無ければ null", () => {
    const vm = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea: polyToArea,
      targetAreaId: "a-missing",
      places: [],
      radiusKm: 5,
      viewportPx: 800,
    });
    expect(vm).toBeNull();
  });

  it("target/neighbor を正しく分類する (半径 5km)", () => {
    const vm = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea: polyToArea,
      targetAreaId: "a-target",
      places,
      radiusKm: 5,
      viewportPx: 800,
    });
    expect(vm).not.toBeNull();
    expect(vm!.targetPolygonId).toBe("poly-target");
    expect(vm!.neighborIds.has("poly-near")).toBe(true);
    expect(vm!.neighborIds.has("poly-far")).toBe(false);
    expect(vm!.neighborIds.has("poly-target")).toBe(false);
  });

  it("論理削除済みの場所は visiblePlaces から除外される", () => {
    const vm = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea: polyToArea,
      targetAreaId: "a-target",
      places,
      radiusKm: 5,
      viewportPx: 800,
    });
    expect(vm!.visiblePlaces.map((p) => p.id).sort()).toEqual(["p1", "p3"]);
  });

  it("minZoom は半径 2N km がビューポートに収まる値", () => {
    const vm = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea: polyToArea,
      targetAreaId: "a-target",
      places: [],
      radiusKm: 5,
      viewportPx: 800,
    });
    // 半径 5km, 緯度 ~35.78, viewport 800px → 既知の値を軽く検証
    expect(vm!.minZoom).toBeGreaterThanOrEqual(12);
    expect(vm!.minZoom).toBeLessThanOrEqual(15);
  });

  it("targetCenter は対象ポリゴンの中心", () => {
    const vm = buildAreaDetailViewModel({
      polygonCenters: centers,
      polygonToArea: polyToArea,
      targetAreaId: "a-target",
      places: [],
      radiusKm: 5,
      viewportPx: 800,
    });
    expect(vm!.targetCenter).toEqual({ lat: 35.776, lng: 140.318 });
  });
});
