import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { useAreaDetailMap } from "./useAreaDetailMap";
import type { MapViewHandle } from "../components/MapView";
import type { PolygonGeoSource } from "../lib/area-detail-controller";
import type { Place } from "../services/place-service";

type MapCalls = Array<[string, unknown[]]>;

interface MockHandle extends MapViewHandle {
  __calls: MapCalls;
}

function makeHandle(): MockHandle {
  const calls: MapCalls = [];
  const handle: Partial<MapViewHandle> & { __calls: MapCalls } = {
    __calls: calls,
    setEditor: vi.fn((...a) => {
      calls.push(["setEditor", a]);
    }),
    setDetailMode: vi.fn((...a) => {
      calls.push(["setDetailMode", a]);
    }),
    clearDetailMode: vi.fn(() => {
      calls.push(["clearDetailMode", []]);
    }),
    renderAll: vi.fn((...a) => {
      calls.push(["renderAll", a]);
    }),
    setPlaces: vi.fn((...a) => {
      calls.push(["setPlaces", a]);
    }),
    clearPlaces: vi.fn(() => {
      calls.push(["clearPlaces", []]);
    }),
    setMinZoom: vi.fn((...a) => {
      calls.push(["setMinZoom", a]);
    }),
    clearMinZoom: vi.fn(() => {
      calls.push(["clearMinZoom", []]);
    }),
    focusPolygon: vi.fn((...a) => {
      calls.push(["focusPolygon", a]);
    }),
    focusPlace: vi.fn(),
    invalidateSize: vi.fn(),
    setPlaceContextMenuHandler: vi.fn(),
    applyChangeSet: vi.fn(),
    highlightPolygon: vi.fn(),
    setLinkedPolygonIds: vi.fn(),
    enableRubberBand: vi.fn(),
    disableRubberBand: vi.fn(),
    setRubberBandOrigin: vi.fn(),
    enableVertexDrag: vi.fn(),
    disableVertexDrag: vi.fn(),
    showVertices: vi.fn(),
    hideVertices: vi.fn(),
    pixelsToDegrees: vi.fn(() => 0.001),
    getSnapThresholdPx: vi.fn(() => 20),
    startPlaceMove: vi.fn(),
    cancelPlaceMove: vi.fn(),
    isPlaceMoving: vi.fn(() => false),
  };
  return handle as MockHandle;
}

const SAMPLE_RING: [number, number][] = [
  [140.318, 35.776],
  [140.318, 35.778],
  [140.32, 35.778],
  [140.32, 35.776],
  [140.318, 35.776],
];

function makeEditor(): PolygonGeoSource {
  return {
    getPolygons: () => [{ id: "poly-a1", active: true }],
    getPolygonGeoJSON: () => ({
      type: "Polygon",
      coordinates: [SAMPLE_RING],
    }),
  };
}

function makePlace(partial: Partial<Place> & { id: string }): Place {
  return {
    areaId: "a1",
    coord: { lat: 35.777, lng: 140.319 },
    type: "house",
    label: "",
    displayName: "",
    address: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    restoredFromId: null,
    ...partial,
  };
}

interface RenderHookOptions {
  handle?: MockHandle;
  editor?: PolygonGeoSource;
  polygonToArea?: ReadonlyMap<string, string>;
  areaId?: string;
  places?: Place[];
  refreshKey?: number;
  selectedPlaceId?: string | null;
  enableInitialSortAssignment?: boolean;
  noNameLabel?: string;
  linkedPolygonIds?: Set<string>;
  saveSpy?: (p: Place) => Promise<Place>;
  radiusKm?: number;
}

function setup(opts: RenderHookOptions = {}) {
  const handle = opts.handle ?? makeHandle();
  const editor = opts.editor ?? makeEditor();
  const polygonToArea = opts.polygonToArea ?? new Map([["poly-a1", "a1"]]);
  const places = opts.places ?? [];
  const placeService = {
    listPlaces: vi.fn(async () => places),
    savePlace: opts.saveSpy ?? vi.fn(async (p: Place) => p),
  };
  const settingsService = {
    getAreaDetailRadiusKm: vi.fn(async () => opts.radiusKm ?? 5),
  };
  const mapRef: MutableRefObject<MapViewHandle | null> = {
    current: handle,
  };
  const containerRef: MutableRefObject<HTMLDivElement | null> = {
    current: null,
  };
  const result = renderHook(
    (props: { refreshKey?: number; selectedPlaceId?: string | null }) =>
      useAreaDetailMap({
        mapRef,
        containerRef,
        editor,
        polygonToArea,
        areaId: opts.areaId ?? "a1",
        placeService,
        settingsService,
        linkedPolygonIds: opts.linkedPolygonIds,
        noNameLabel: opts.noNameLabel ?? "(名前なし)",
        selectedPlaceId: props.selectedPlaceId ?? opts.selectedPlaceId ?? null,
        refreshKey: props.refreshKey ?? opts.refreshKey ?? 0,
        enableInitialSortAssignment: opts.enableInitialSortAssignment ?? false,
      }),
    {
      initialProps: {
        refreshKey: opts.refreshKey ?? 0,
        selectedPlaceId: opts.selectedPlaceId ?? null,
      },
    },
  );
  return { ...result, handle, placeService, settingsService };
}

describe("useAreaDetailMap", () => {
  it("editor + polygonToArea provided → applies map setup (setEditor, setDetailMode, setPlaces, focusPolygon)", async () => {
    const { handle } = setup();
    await waitFor(() => {
      const names = handle.__calls.map(([n]) => n);
      expect(names).toContain("setEditor");
      expect(names).toContain("setDetailMode");
      expect(names).toContain("renderAll");
      expect(names).toContain("setPlaces");
      expect(names).toContain("setMinZoom");
      expect(names).toContain("focusPolygon");
    });
  });

  it("editor undefined → no map setup is performed", async () => {
    const handle = makeHandle();
    const mapRef: MutableRefObject<MapViewHandle | null> = { current: handle };
    const containerRef: MutableRefObject<HTMLDivElement | null> = {
      current: null,
    };
    renderHook(() =>
      useAreaDetailMap({
        mapRef,
        containerRef,
        editor: undefined,
        polygonToArea: new Map(),
        areaId: "a1",
        noNameLabel: "(名前なし)",
      }),
    );
    // 何も呼ばれていないことを確認 (短い待機後)
    await new Promise((r) => setTimeout(r, 20));
    expect(handle.__calls).toHaveLength(0);
  });

  it("places: parentId === '' のものを返し、rooms: type === 'room' のものを返す", async () => {
    const places = [
      makePlace({ id: "h1", label: "House A" }),
      makePlace({ id: "b1", type: "building", label: "Bldg" }),
      makePlace({
        id: "r1",
        type: "room",
        parentId: "b1",
        coord: { lat: 0, lng: 0 },
      }),
    ];
    const { result } = setup({ places });
    await waitFor(() => {
      expect(result.current.places.map((p) => p.id).sort()).toEqual([
        "b1",
        "h1",
      ]);
      expect(result.current.rooms.map((p) => p.id)).toEqual(["r1"]);
    });
  });

  it("setPlaces: sortOrder 昇順で index が 0 始まりに採番される", async () => {
    const places = [
      makePlace({
        id: "p1",
        label: "Alpha",
        sortOrder: 2,
      }),
      makePlace({
        id: "p2",
        label: "Bravo",
        sortOrder: 0,
      }),
    ];
    const { handle } = setup({ places });
    await waitFor(() => {
      const setPlacesCall = handle.__calls.find(([n]) => n === "setPlaces");
      expect(setPlacesCall).toBeDefined();
    });
    const lastCall = [...handle.__calls]
      .reverse()
      .find(([n]) => n === "setPlaces")!;
    const passed = lastCall[1][0] as Array<{ id: string; index?: number }>;
    const byId = new Map(passed.map((p) => [p.id, p.index]));
    expect(byId.get("p2")).toBe(0);
    expect(byId.get("p1")).toBe(1);
  });

  it("selectedPlaceId に該当する place は selected=true で setPlaces に渡される", async () => {
    const places = [
      makePlace({ id: "p1", label: "A" }),
      makePlace({ id: "p2", label: "B" }),
    ];
    const { handle } = setup({ places, selectedPlaceId: "p2" });
    await waitFor(() => {
      const c = [...handle.__calls].reverse().find(([n]) => n === "setPlaces");
      expect(c).toBeDefined();
      const passed = c![1][0] as Array<{ id: string; selected?: boolean }>;
      const byId = new Map(passed.map((p) => [p.id, p.selected]));
      expect(byId.get("p2")).toBe(true);
      expect(byId.get("p1")).toBeFalsy();
    });
  });

  it("setPlaces: tooltip は label と address を ' / ' で結合し、両方空なら noNameLabel", async () => {
    const places = [
      makePlace({ id: "p1", label: "Alpha", address: "1-2-3" }),
      makePlace({ id: "p2", label: "", address: "" }),
    ];
    const { handle } = setup({ places, noNameLabel: "NONAME" });
    await waitFor(() => {
      const c = [...handle.__calls].reverse().find(([n]) => n === "setPlaces");
      expect(c).toBeDefined();
      const passed = c![1][0] as Array<{ id: string; tooltip?: string }>;
      const byId = new Map(passed.map((p) => [p.id, p.tooltip]));
      expect(byId.get("p1")).toBe("Alpha / 1-2-3");
      expect(byId.get("p2")).toBe("NONAME");
    });
  });

  it("focusPolygon: 初回適用時のみ呼ばれ、refreshKey 変化での再描画では呼ばれない (skipFocus=true)", async () => {
    const { handle, rerender } = setup({ places: [] });
    await waitFor(() => {
      expect(handle.__calls.some(([n]) => n === "focusPolygon")).toBe(true);
    });
    const focusCount1 = handle.__calls.filter(
      ([n]) => n === "focusPolygon",
    ).length;
    expect(focusCount1).toBe(1);

    rerender({ refreshKey: 1, selectedPlaceId: null });

    await waitFor(() => {
      // setPlaces は再度呼ばれているはず
      const setPlacesCount = handle.__calls.filter(
        ([n]) => n === "setPlaces",
      ).length;
      expect(setPlacesCount).toBeGreaterThanOrEqual(2);
    });
    const focusCount2 = handle.__calls.filter(
      ([n]) => n === "focusPolygon",
    ).length;
    expect(focusCount2).toBe(1);
  });

  it("isInsideTarget: 対象ポリゴン内なら true、外なら false", async () => {
    const { result } = setup();
    await waitFor(() => {
      // ring がセットされた後 (setPlaces 等が呼ばれた後)
      expect(result.current.isInsideTarget(35.777, 140.319)).toBe(true);
    });
    expect(result.current.isInsideTarget(36.0, 141.0)).toBe(false);
  });

  it("enableInitialSortAssignment=true: 全 place が sortOrder=0 なら CreatedAt 昇順で savePlace を呼ぶ", async () => {
    const saveSpy = vi.fn(async (p: Place) => p);
    const places = [
      makePlace({
        id: "newer",
        label: "newer",
        createdAt: "2026-02-01T00:00:00Z",
      }),
      makePlace({
        id: "older",
        label: "older",
        createdAt: "2026-01-01T00:00:00Z",
      }),
    ];
    setup({
      places,
      saveSpy,
      enableInitialSortAssignment: true,
    });
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
    const saved = saveSpy.mock.calls.map(
      (c) => c[0] as { id: string; sortOrder: number },
    );
    const byId = new Map(saved.map((s) => [s.id, s.sortOrder]));
    expect(byId.get("older")).toBe(0);
    expect(byId.get("newer")).toBe(1);
  });

  it("enableInitialSortAssignment=false (default): savePlace は呼ばれない", async () => {
    const saveSpy = vi.fn(async (p: Place) => p);
    const places = [
      makePlace({ id: "p1", label: "A", sortOrder: 0 }),
      makePlace({ id: "p2", label: "B", sortOrder: 0 }),
    ];
    const { handle } = setup({ places, saveSpy });
    // hook の内部 setPlaces 呼び出しを待って完了確認
    await waitFor(() => {
      expect(handle.__calls.some(([n]) => n === "setPlaces")).toBe(true);
    });
    // 余裕を持って待って save が起きないことを確認
    await new Promise((r) => setTimeout(r, 30));
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("refreshKey 変化で listPlaces が再呼び出しされる", async () => {
    const places = [makePlace({ id: "p1", label: "A" })];
    const { placeService, rerender } = setup({ places });
    await waitFor(() => {
      expect(placeService.listPlaces).toHaveBeenCalledTimes(1);
    });
    rerender({ refreshKey: 1, selectedPlaceId: null });
    await waitFor(() => {
      expect(placeService.listPlaces).toHaveBeenCalledTimes(2);
    });
  });
});
