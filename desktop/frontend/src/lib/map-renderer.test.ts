import { describe, it, expect } from "vitest";
import { getPolygonStyle, findNearestVertex } from "./map-renderer";
import type { SnapVertex } from "./map-renderer";

describe("getPolygonStyle", () => {
  it("紐づき+選択: 濃い緑", () => {
    const style = getPolygonStyle(true, true);
    expect(style.color).toBe("#166534");
    expect(style.fillOpacity).toBe(0.35);
    expect(style.weight).toBe(3);
  });

  it("紐づき+非選択: 薄い緑", () => {
    const style = getPolygonStyle(true, false);
    expect(style.color).toBe("#22c55e");
    expect(style.fillOpacity).toBe(0.15);
    expect(style.weight).toBe(2);
  });

  it("未紐づき+選択: 濃い青", () => {
    const style = getPolygonStyle(false, true);
    expect(style.color).toBe("#1e40af");
    expect(style.fillOpacity).toBe(0.35);
    expect(style.weight).toBe(3);
  });

  it("未紐づき+非選択: 薄い青", () => {
    const style = getPolygonStyle(false, false);
    expect(style.color).toBe("#3b82f6");
    expect(style.fillOpacity).toBe(0.15);
    expect(style.weight).toBe(2);
  });
});

describe("findNearestVertex", () => {
  const vertices: SnapVertex[] = [
    { lat: 35.776, lng: 140.318, polygonId: "p1", vertexIndex: 0 },
    { lat: 35.777, lng: 140.319, polygonId: "p1", vertexIndex: 1 },
    { lat: 35.78, lng: 140.322, polygonId: "p2", vertexIndex: 0 },
  ];

  it("閾値内の最近接頂点を返す（polygonId, vertexIndex付き）", () => {
    const result = findNearestVertex(35.7761, 140.3181, vertices, 0.001);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(35.776);
    expect(result!.lng).toBe(140.318);
    expect(result!.polygonId).toBe("p1");
    expect(result!.vertexIndex).toBe(0);
  });

  it("閾値外なら null を返す", () => {
    const result = findNearestVertex(35.79, 140.33, vertices, 0.001);
    expect(result).toBeNull();
  });

  it("空リストなら null を返す", () => {
    const result = findNearestVertex(35.776, 140.318, [], 0.001);
    expect(result).toBeNull();
  });

  it("複数候補から最も近いものを返す", () => {
    const result = findNearestVertex(35.7775, 140.3195, vertices, 0.01);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(35.777);
    expect(result!.lng).toBe(140.319);
  });
});
