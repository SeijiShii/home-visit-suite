import { describe, it, expect } from "vitest";
import {
  polygonCentersFromEditor,
  type PolygonGeoSource,
} from "./area-detail-controller";
import type { Polygon as GeoPolygon } from "geojson";

function makeSource(
  polys: Array<{ id: string; ring: [number, number][]; active?: boolean }>,
): PolygonGeoSource {
  const byId = new Map<string, GeoPolygon>();
  for (const p of polys) {
    byId.set(p.id, { type: "Polygon", coordinates: [p.ring] });
  }
  return {
    getPolygons: () => polys.map((p) => ({ id: p.id, active: p.active })),
    getPolygonGeoJSON: (id: string) => byId.get(id) ?? null,
  };
}

describe("polygonCentersFromEditor", () => {
  it("閉じたリングの末尾を除外して平均中心を計算する", () => {
    // 正方形 (0,0)-(0,2)-(2,2)-(2,0)-(0,0) → 中心 (1,1)
    // 注: GeoJSON は [lng, lat]
    const src = makeSource([
      {
        id: "p1",
        ring: [
          [140.0, 35.0],
          [140.0, 35.02],
          [140.02, 35.02],
          [140.02, 35.0],
          [140.0, 35.0],
        ],
      },
    ]);
    const centers = polygonCentersFromEditor(src);
    expect(centers).toHaveLength(1);
    expect(centers[0].id).toBe("p1");
    expect(centers[0].center.lat).toBeCloseTo(35.01, 10);
    expect(centers[0].center.lng).toBeCloseTo(140.01, 10);
  });

  it("active=false のポリゴンは除外される", () => {
    const src = makeSource([
      {
        id: "p1",
        active: true,
        ring: [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      },
      {
        id: "p2",
        active: false,
        ring: [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      },
    ]);
    const centers = polygonCentersFromEditor(src);
    expect(centers.map((c) => c.id)).toEqual(["p1"]);
  });

  it("GeoJSON が null / 空なら該当ポリゴンはスキップ", () => {
    const src: PolygonGeoSource = {
      getPolygons: () => [{ id: "p1" }, { id: "p2" }],
      getPolygonGeoJSON: (id) =>
        id === "p1"
          ? null
          : { type: "Polygon", coordinates: [] },
    };
    const centers = polygonCentersFromEditor(src);
    expect(centers).toEqual([]);
  });
});
