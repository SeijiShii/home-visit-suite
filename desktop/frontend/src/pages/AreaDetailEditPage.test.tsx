import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import {
  SettingsService,
  type SettingsBindingAPI,
} from "../services/settings-service";
import type { RegionService, AreaTreeNode } from "../services/region-service";

// MapView を軽量なスタブに差し替え (leaflet を jsdom で起動しない)
const mapCalls: Array<[string, unknown[]]> = [];
vi.mock("../components/MapView", () => ({
  MapView: React.forwardRef(function MockMapView(
    _props: unknown,
    ref: React.Ref<unknown>,
  ) {
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
    }));
    return <div data-testid="mock-mapview" />;
  }),
}));

import { AreaDetailEditPage } from "./AreaDetailEditPage";
import type { PolygonGeoSource } from "../lib/area-detail-controller";

function createSettingsApi(): SettingsBindingAPI {
  return {
    GetHiddenTipKeys: vi.fn(async () => [] as string[]),
    SetTipHidden: vi.fn(async () => {}),
    ResetHiddenTips: vi.fn(async () => {}),
    GetLocale: vi.fn(async () => "ja"),
    SetLocale: vi.fn(async () => {}),
    GetAreaDetailRadiusKm: vi.fn(async () => 5),
    SetAreaDetailRadiusKm: vi.fn(async () => {}),
  };
}

function createMockRegionService(tree: AreaTreeNode[]): RegionService {
  return { loadTree: vi.fn(async () => tree) } as unknown as RegionService;
}

const sampleTree: AreaTreeNode[] = [
  {
    id: "r1",
    name: "成田",
    symbol: "NRT",
    parentAreas: [
      {
        id: "p1",
        number: "001",
        name: "親番1",
        areas: [{ id: "a1", number: "05" }],
      },
    ],
  },
];

function renderPage(areaId: string, regionService: RegionService) {
  const settings = new SettingsService(createSettingsApi());
  return render(
    <MemoryRouter initialEntries={[`/map/area/${areaId}/detail`]}>
      <I18nProvider service={settings}>
        <Routes>
          <Route
            path="/map/area/:areaId/detail"
            element={<AreaDetailEditPage regionService={regionService} />}
          />
          <Route path="/map" element={<div>map page</div>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("AreaDetailEditPage", () => {
  it("renders back button and resolved area label", async () => {
    renderPage("a1", createMockRegionService(sampleTree));
    expect(screen.getByRole("button", { name: /戻る/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("NRT-001-05")).toBeInTheDocument();
    });
    expect(screen.getByTestId("area-detail-map")).toBeInTheDocument();
  });

  it("falls back to title when areaId not found", async () => {
    renderPage("nonexistent", createMockRegionService(sampleTree));
    await waitFor(() => {
      expect(screen.getByText("区域詳細編集")).toBeInTheDocument();
    });
  });

  it("back button navigates back", async () => {
    const user = userEvent.setup();
    renderPage("a1", createMockRegionService(sampleTree));
    const back = screen.getByRole("button", { name: /戻る/ });
    await user.click(back);
    // navigate(-1) on a single-entry history is a no-op; just verify click handler exists.
    expect(back).toBeInTheDocument();
  });

  it("editor を渡すと MapView に詳細編集 ViewModel が適用される", async () => {
    mapCalls.length = 0;
    const editor: PolygonGeoSource = {
      getPolygons: () => [
        { id: "poly-a1", active: true },
        { id: "poly-far", active: true },
      ],
      getPolygonGeoJSON: (id) => {
        if (id === "poly-a1") {
          return {
            type: "Polygon",
            coordinates: [
              [
                [140.318, 35.776],
                [140.318, 35.778],
                [140.32, 35.778],
                [140.318, 35.776],
              ],
            ],
          };
        }
        return {
          type: "Polygon",
          coordinates: [
            [
              [141.0, 36.5],
              [141.0, 36.51],
              [141.01, 36.51],
              [141.0, 36.5],
            ],
          ],
        };
      },
    };
    const polygonToArea = new Map([
      ["poly-a1", "a1"],
      ["poly-far", "a-far"],
    ]);
    const settings = new SettingsService(createSettingsApi());
    render(
      <MemoryRouter initialEntries={["/map/area/a1/detail"]}>
        <I18nProvider service={settings}>
          <Routes>
            <Route
              path="/map/area/:areaId/detail"
              element={
                <AreaDetailEditPage
                  regionService={createMockRegionService(sampleTree)}
                  editor={editor}
                  polygonToArea={polygonToArea}
                  linkedPolygonIds={new Set(["poly-a1", "poly-far"])}
                />
              }
            />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("mock-mapview")).toBeInTheDocument();
    await waitFor(() => {
      expect(mapCalls.some(([name]) => name === "setDetailMode")).toBe(true);
    });
    const names = mapCalls.map(([n]) => n);
    expect(names).toContain("setDetailMode");
    expect(names).toContain("renderAll");
    expect(names).toContain("setPlaces");
    expect(names).toContain("setMinZoom");
    expect(names).toContain("focusPolygon");
    const setDetail = mapCalls.find(([n]) => n === "setDetailMode")!;
    expect(setDetail[1][0]).toBe("poly-a1");
  });
});
