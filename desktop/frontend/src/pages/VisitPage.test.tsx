import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";
import type { VisitRecord } from "../services/visit-service";
import type { PolygonGeoSource } from "../lib/area-detail-controller";

// MapView を軽量なスタブに差し替え (leaflet を jsdom で起動しない)
const mapCalls: Array<[string, unknown[]]> = [];
const mockMapProps: {
  onContextMenu?: (lat: number, lng: number, x: number, y: number) => void;
  placeContextHandler?: (
    placeId: string,
    type: string,
    x: number,
    y: number,
  ) => void;
  placeClickHandler?: (placeId: string, type: string) => void;
} = {};
vi.mock("../components/MapView", () => ({
  MapView: React.forwardRef(function MockMapView(
    props: {
      onContextMenu?: (lat: number, lng: number, x: number, y: number) => void;
    },
    ref: React.Ref<unknown>,
  ) {
    mockMapProps.onContextMenu = props.onContextMenu;
    React.useImperativeHandle(ref, () => ({
      setEditor: (...a: unknown[]) => mapCalls.push(["setEditor", a]),
      setDetailMode: (...a: unknown[]) => mapCalls.push(["setDetailMode", a]),
      clearDetailMode: () => mapCalls.push(["clearDetailMode", []]),
      renderAll: (...a: unknown[]) => mapCalls.push(["renderAll", a]),
      setPlaces: (...a: unknown[]) => mapCalls.push(["setPlaces", a]),
      clearPlaces: () => mapCalls.push(["clearPlaces", []]),
      setMinZoom: (...a: unknown[]) => mapCalls.push(["setMinZoom", a]),
      clearMinZoom: () => mapCalls.push(["clearMinZoom", []]),
      focusPolygon: (...a: unknown[]) => mapCalls.push(["focusPolygon", a]),
      focusPlace: (...a: unknown[]) => mapCalls.push(["focusPlace", a]),
      invalidateSize: () => mapCalls.push(["invalidateSize", []]),
      setPlaceContextMenuHandler: (cb: unknown) => {
        mockMapProps.placeContextHandler =
          cb as typeof mockMapProps.placeContextHandler;
      },
      setPlaceClickHandler: (cb: unknown) => {
        mockMapProps.placeClickHandler =
          cb as typeof mockMapProps.placeClickHandler;
      },
    }));
    return <div data-testid="mock-mapview" />;
  }),
}));

import { VisitPage } from "./VisitPage";

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

function makeHouse(partial: Partial<Place> & { id: string }): Place {
  return {
    areaId: "NRT-001-01",
    coord: { lat: 35.777, lng: 140.319 },
    type: "house",
    label: "田中宅",
    displayName: "",
    address: "千葉県成田市1-2-3",
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

function makeBuilding(partial: Partial<Place> & { id: string }): Place {
  return makeHouse({ type: "building", label: "○○マンション", ...partial });
}

function makeRoom(
  partial: Partial<Place> & { id: string; parentId: string },
): Place {
  return makeHouse({
    ...partial,
    type: "room",
    label: "",
    displayName: partial.displayName ?? "101",
    coord: { lat: 0, lng: 0 },
  });
}

function fakePlaceService(places: Place[]) {
  return {
    listPlaces: vi.fn().mockResolvedValue(places),
    getPlace: vi.fn(),
    savePlace: vi.fn(),
    deletePlace: vi.fn(),
    listDeletedPlacesNear: vi.fn().mockResolvedValue([]),
  };
}

function fakeVisitService() {
  return {
    recordVisit: vi.fn().mockResolvedValue({} as VisitRecord),
    listMyVisitHistory: vi.fn().mockResolvedValue([] as VisitRecord[]),
    getLastMetDate: vi.fn().mockResolvedValue(null),
    deleteVisitRecord: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPage(overrides: Partial<Parameters<typeof VisitPage>[0]> = {}) {
  const places: Place[] = [];
  const defaults: Parameters<typeof VisitPage>[0] = {
    areaId: "NRT-001-01",
    actorId: "did:key:user-A",
    placeService: fakePlaceService(places),
    visitService: fakeVisitService(),
    editor: makeEditor(),
    polygonToArea: new Map([["poly-a1", "NRT-001-01"]]),
    linkedPolygonIds: new Set(["poly-a1"]),
    onPlaceCreateRequest: vi.fn(),
    onPlaceModifyRequest: vi.fn(),
  };
  return render(
    <I18nProvider>
      <VisitPage {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mapCalls.length = 0;
  mockMapProps.onContextMenu = undefined;
  mockMapProps.placeContextHandler = undefined;
  mockMapProps.placeClickHandler = undefined;
});

describe("VisitPage — Phase 1 暫定", () => {
  it("shows Phase 1 banner with target area id", async () => {
    renderPage({ areaId: "NRT-001-01" });
    await waitFor(() => {
      expect(screen.getByText(/Phase 1/i)).toBeInTheDocument();
      expect(screen.getByText(/NRT-001-01/)).toBeInTheDocument();
    });
  });

  it("renders the MapView (no list fallback)", async () => {
    renderPage();
    expect(await screen.findByTestId("mock-mapview")).toBeInTheDocument();
  });

  it("loads places and applies them to the map (setPlaces called with house + building)", async () => {
    const ps = fakePlaceService([
      makeHouse({ id: "h1", label: "田中" }),
      makeBuilding({ id: "b1", label: "Apt" }),
      makeRoom({ id: "r1", parentId: "b1" }),
    ]);
    renderPage({
      placeService: ps,
      polygonToArea: new Map([["poly-a1", "NRT-001-01"]]),
    });
    await waitFor(() => {
      expect(ps.listPlaces).toHaveBeenCalledWith("NRT-001-01");
    });
    await waitFor(() => {
      const setPlacesCall = mapCalls.find(([n]) => n === "setPlaces");
      expect(setPlacesCall).toBeDefined();
      const passed = setPlacesCall![1][0] as Array<{
        id: string;
        type: string;
      }>;
      const ids = passed.map((p) => p.id).sort();
      // room は area-level でないため setPlaces には含まれない
      expect(ids).toEqual(["b1", "h1"]);
    });
  });

  it("地図セットアップ: setEditor → setDetailMode → renderAll → setPlaces → setMinZoom → focusPolygon", async () => {
    renderPage();
    await waitFor(() => {
      const names = mapCalls.map(([n]) => n);
      expect(names).toContain("setEditor");
      expect(names).toContain("setDetailMode");
      expect(names).toContain("setPlaces");
      expect(names).toContain("focusPolygon");
    });
  });
});

describe("VisitPage — dialog open flow", () => {
  it("place click on house → VisitRecordDialog が開く", async () => {
    const ps = fakePlaceService([makeHouse({ id: "h1", label: "田中" })]);
    renderPage({ placeService: ps });
    await waitFor(() => {
      expect(mockMapProps.placeClickHandler).toBeDefined();
      // place が hook 内で読み込まれて setPlaces 経由で渡されるまで待つ
      expect(mapCalls.find(([n]) => n === "setPlaces")).toBeDefined();
    });
    mockMapProps.placeClickHandler!("h1", "house");
    expect(
      await screen.findByRole("dialog", { name: /訪問記録/ }),
    ).toBeInTheDocument();
  });

  it("place click on building → BuildingVisitDialog が開く", async () => {
    const ps = fakePlaceService([makeBuilding({ id: "b1", label: "Apt" })]);
    renderPage({ placeService: ps });
    await waitFor(() => {
      expect(mockMapProps.placeClickHandler).toBeDefined();
      expect(mapCalls.find(([n]) => n === "setPlaces")).toBeDefined();
    });
    mockMapProps.placeClickHandler!("b1", "building");
    expect(
      await screen.findByRole("dialog", { name: /集合住宅の訪問/ }),
    ).toBeInTheDocument();
  });

  it("地図長押し (空白) → PlaceCreateRequestDialog が開く (lat/lng 受け渡し)", async () => {
    renderPage();
    await waitFor(() => expect(mockMapProps.onContextMenu).toBeDefined());
    mockMapProps.onContextMenu!(35.7771, 140.319, 100, 200);
    expect(
      await screen.findByRole("dialog", { name: /場所の追加を申請/ }),
    ).toBeInTheDocument();
  });
});

describe("VisitPage — save flow", () => {
  it("saving a met visit calls visitService.recordVisit", async () => {
    const vs = fakeVisitService();
    const ps = fakePlaceService([makeHouse({ id: "h1", label: "田中" })]);
    renderPage({ placeService: ps, visitService: vs });
    await waitFor(() => {
      expect(mockMapProps.placeClickHandler).toBeDefined();
      expect(mapCalls.find(([n]) => n === "setPlaces")).toBeDefined();
    });
    mockMapProps.placeClickHandler!("h1", "house");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/訪問メモ/), "test note");
    await user.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => {
      expect(vs.recordVisit).toHaveBeenCalledOnce();
    });
    const args = vs.recordVisit.mock.calls[0];
    expect(args[0]).toBe("did:key:user-A");
    expect(args[2]).toBe("h1");
    expect(args[3]).toBe("met");
    expect(args[5]).toBe("");
  });

  it("place create request submit → onPlaceCreateRequest コールバックが呼ばれる (lat/lng 含む)", async () => {
    const onCreateReq = vi.fn();
    renderPage({ onPlaceCreateRequest: onCreateReq });
    await waitFor(() => expect(mockMapProps.onContextMenu).toBeDefined());
    mockMapProps.onContextMenu!(35.7775, 140.3195, 0, 0);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/補足情報/), "新築の家");
    await user.click(screen.getByRole("button", { name: /申請を送信/ }));
    await waitFor(() => expect(onCreateReq).toHaveBeenCalledOnce());
    const arg = onCreateReq.mock.calls[0][0];
    expect(arg.lat).toBeCloseTo(35.7775, 4);
    expect(arg.lng).toBeCloseTo(140.3195, 4);
    expect(arg.text).toBe("新築の家");
  });
});
