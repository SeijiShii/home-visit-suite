import { describe, it, expect, vi } from "vitest";
import {
  applyDetailViewModelToMap,
  clearDetailViewModelFromMap,
  type DetailMapHandleLike,
  type PlaceWithType,
} from "./area-detail-map-integration";
import type { AreaDetailViewModel } from "./area-detail-controller";
import type { PolygonID } from "map-polygon-editor";

function mockHandle(): DetailMapHandleLike & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    setDetailMode: vi.fn((id, ns) =>
      calls.push(`setDetailMode:${id}:${[...ns].sort().join(",")}`),
    ),
    clearDetailMode: vi.fn(() => calls.push("clearDetailMode")),
    renderAll: vi.fn((ids?: Set<string>) =>
      calls.push(`renderAll:${ids ? [...ids].sort().join(",") : ""}`),
    ),
    setPlaces: vi.fn((ps: ReadonlyArray<{ id: string }>) =>
      calls.push(
        `setPlaces:${ps
          .map((p) => p.id)
          .sort()
          .join(",")}`,
      ),
    ),
    clearPlaces: vi.fn(() => calls.push("clearPlaces")),
    setMinZoom: vi.fn((z) => calls.push(`setMinZoom:${z}`)),
    clearMinZoom: vi.fn(() => calls.push("clearMinZoom")),
    focusPolygon: vi.fn((id) => calls.push(`focusPolygon:${id}`)),
  };
}

const vm: AreaDetailViewModel = {
  targetPolygonId: "poly-1",
  targetCenter: { lat: 35.78, lng: 140.32 },
  neighborIds: new Set(["poly-2", "poly-3"]),
  visiblePlaces: [
    { id: "p1", lat: 35.78, lng: 140.32 },
    { id: "p2", lat: 35.781, lng: 140.321 },
  ],
  minZoom: 14,
};

const allPlaces: PlaceWithType[] = [
  { id: "p1", lat: 35.78, lng: 140.32, type: "house" },
  { id: "p2", lat: 35.781, lng: 140.321, type: "building" },
  // 削除済みなど VM に含まれない場所
  { id: "p3", lat: 35.782, lng: 140.322, type: "room" },
];

describe("applyDetailViewModelToMap", () => {
  it("setDetailMode → renderAll → setPlaces → setMinZoom → focusPolygon の順に呼ぶ", () => {
    const h = mockHandle();
    const linked = new Set(["poly-1", "poly-2", "poly-3", "poly-4"]);
    applyDetailViewModelToMap(h, vm, allPlaces, linked);
    expect(h.calls).toEqual([
      "setDetailMode:poly-1:poly-2,poly-3",
      "renderAll:poly-1,poly-2,poly-3,poly-4",
      "setPlaces:p1,p2",
      "setMinZoom:14",
      "focusPolygon:poly-1",
    ]);
  });

  it("visiblePlaces に含まれない場所は setPlaces に渡されない", () => {
    const h = mockHandle();
    applyDetailViewModelToMap(h, vm, allPlaces, new Set());
    expect(h.setPlaces).toHaveBeenCalledOnce();
    const arg = (h.setPlaces as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as PlaceWithType[];
    expect(arg.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("場所の種別は allPlaces の値が保たれる", () => {
    const h = mockHandle();
    applyDetailViewModelToMap(h, vm, allPlaces, new Set());
    const arg = (h.setPlaces as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as PlaceWithType[];
    const byId = new Map(arg.map((p) => [p.id, p.type]));
    expect(byId.get("p1")).toBe("house");
    expect(byId.get("p2")).toBe("building");
  });
});

describe("clearDetailViewModelFromMap", () => {
  it("clearPlaces → clearMinZoom → clearDetailMode → renderAll の順に呼ぶ", () => {
    const h = mockHandle();
    clearDetailViewModelFromMap(h, new Set(["poly-1"]));
    expect(h.calls).toEqual([
      "clearPlaces",
      "clearMinZoom",
      "clearDetailMode",
      "renderAll:poly-1",
    ]);
  });
});

describe("PolygonID cast", () => {
  it("string の polygonId がそのまま PolygonID として扱われる", () => {
    const h = mockHandle();
    applyDetailViewModelToMap(h, vm, allPlaces, new Set());
    const setDetailCall = (
      h.setDetailMode as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(setDetailCall[0] as PolygonID).toBe("poly-1" as PolygonID);
  });
});
