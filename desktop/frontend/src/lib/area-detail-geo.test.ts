import { describe, it, expect } from "vitest";
import {
  polygonCenter,
  haversineKm,
  findNeighborPolygons,
  findNearbyDeletedPlace,
  minZoomForRadius,
  type LatLng,
} from "./area-detail-geo";

describe("polygonCenter", () => {
  it("returns centroid of vertex coordinates", () => {
    const verts: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    const c = polygonCenter(verts);
    expect(c.lat).toBeCloseTo(1, 6);
    expect(c.lng).toBeCloseTo(1, 6);
  });

  it("throws for empty vertex list", () => {
    expect(() => polygonCenter([])).toThrow();
  });
});

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(
      haversineKm({ lat: 35, lng: 139 }, { lat: 35, lng: 139 }),
    ).toBeCloseTo(0, 6);
  });

  it("approximates Tokyo→Osaka ~400km", () => {
    const tokyo = { lat: 35.681, lng: 139.767 };
    const osaka = { lat: 34.702, lng: 135.495 };
    const d = haversineKm(tokyo, osaka);
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(410);
  });
});

describe("findNeighborPolygons", () => {
  const target = { id: "T", center: { lat: 35.0, lng: 139.0 } };
  const inside = { id: "A", center: { lat: 35.01, lng: 139.01 } }; // ~1.4km
  const outside = { id: "B", center: { lat: 35.1, lng: 139.1 } }; // ~14km

  it("excludes target itself", () => {
    const result = findNeighborPolygons(target, [target, inside, outside], 5);
    expect(result.map((p) => p.id)).not.toContain("T");
  });

  it("includes polygons within radius km", () => {
    const result = findNeighborPolygons(target, [target, inside, outside], 5);
    expect(result.map((p) => p.id)).toEqual(["A"]);
  });

  it("returns empty when no neighbors", () => {
    const result = findNeighborPolygons(target, [target, outside], 5);
    expect(result).toEqual([]);
  });
});

describe("minZoomForRadius", () => {
  it("returns lower zoom for larger radius", () => {
    const z5 = minZoomForRadius({ radiusKm: 5, latitude: 35.7, viewportPx: 800 });
    const z1 = minZoomForRadius({ radiusKm: 1, latitude: 35.7, viewportPx: 800 });
    expect(z5).toBeLessThan(z1);
  });

  it("5km radius at lat 35.7 with 800px viewport gives zoom around 12-13", () => {
    const z = minZoomForRadius({ radiusKm: 5, latitude: 35.7, viewportPx: 800 });
    expect(z).toBeGreaterThanOrEqual(11);
    expect(z).toBeLessThanOrEqual(14);
  });

  it("clamps to integer", () => {
    const z = minZoomForRadius({ radiusKm: 5, latitude: 35.7, viewportPx: 800 });
    expect(Number.isInteger(z)).toBe(true);
  });

  it("throws for non-positive radius", () => {
    expect(() => minZoomForRadius({ radiusKm: 0, latitude: 35, viewportPx: 800 })).toThrow();
  });
});

describe("findNearbyDeletedPlace", () => {
  const target = { lat: 35.7, lng: 139.7 };
  const within = { id: "p1", lat: 35.700001, lng: 139.700001, deletedAt: "2026-01-01" }; // ~0.15m
  const far = { id: "p2", lat: 35.7001, lng: 139.7, deletedAt: "2026-01-01" }; // ~11m
  const alive = { id: "p3", lat: 35.7, lng: 139.7, deletedAt: null };

  it("returns deleted place within 5m", () => {
    const found = findNearbyDeletedPlace(target, [within, far, alive], 5);
    expect(found?.id).toBe("p1");
  });

  it("returns null when only alive place is nearby", () => {
    expect(findNearbyDeletedPlace(target, [alive], 5)).toBeNull();
  });

  it("returns null when no place within radius", () => {
    expect(findNearbyDeletedPlace(target, [far], 5)).toBeNull();
  });
});

import { formatAreaLabel, type AreaTreeLite } from "./area-detail-geo";

describe("formatAreaLabel", () => {
  const tree: AreaTreeLite[] = [
    {
      symbol: "NRT",
      parentAreas: [
        {
          number: "001",
          areas: [
            { id: "a1", number: "05" },
            { id: "a2", number: "06" },
          ],
        },
        {
          number: "002",
          areas: [{ id: "a3", number: "01" }],
        },
      ],
    },
  ];

  it("formats {symbol}-{parentNumber}-{areaNumber}", () => {
    expect(formatAreaLabel(tree, "a1")).toBe("NRT-001-05");
    expect(formatAreaLabel(tree, "a2")).toBe("NRT-001-06");
    expect(formatAreaLabel(tree, "a3")).toBe("NRT-002-01");
  });

  it("returns null when areaId not found", () => {
    expect(formatAreaLabel(tree, "missing")).toBeNull();
  });
});
